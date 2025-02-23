import { arrayBufferToBase64, base64ToArrayBuffer } from "./utils/audio";
import { Input, InputConfig } from "./utils/input";
import { Output } from "./utils/output";
import {
  Connection,
  DisconnectionDetails,
  OnDisconnectCallback,
  SessionConfig,
} from "./utils/connection";
import { ClientToolCallEvent, IncomingSocketEvent } from "./utils/events";
import { isAndroidDevice, isIosDevice } from "./utils/compatibility";

export type { IncomingSocketEvent } from "./utils/events";
export type { SessionConfig, DisconnectionDetails } from "./utils/connection";
export type Role = "user" | "ai";
export type Mode = "speaking" | "listening";
export type Status =
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected";
export type Options = SessionConfig &
  Callbacks &
  ClientToolsConfig &
  InputConfig;
export type ClientToolsConfig = {
  clientTools: Record<
    string,
    (
      parameters: any
    ) => Promise<string | number | void> | string | number | void
  >;
};
export type Callbacks = {
  onConnect: (props: { conversationId: string }) => void;
  // internal debug events, not to be used
  onDebug: (props: any) => void;
  onDisconnect: OnDisconnectCallback;
  onError: (message: string, context?: any) => void;
  onMessage: (props: { message: string; source: Role }) => void;
  onModeChange: (prop: { mode: Mode }) => void;
  onStatusChange: (prop: { status: Status }) => void;
  onCanSendFeedbackChange: (prop: { canSendFeedback: boolean }) => void;
  onUnhandledClientToolCall?: (
    params: ClientToolCallEvent["client_tool_call"]
  ) => void;
};

const defaultClientTools = { clientTools: {} };
const defaultCallbacks: Callbacks = {
  onConnect: () => {},
  onDebug: () => {},
  onDisconnect: () => {},
  onError: () => {},
  onMessage: () => {},
  onModeChange: () => {},
  onStatusChange: () => {},
  onCanSendFeedbackChange: () => {},
};

const HTTPS_API_ORIGIN = "https://api.elevenlabs.io";

export class Conversation {
  public static async startSession(
    options: SessionConfig &
      Partial<Callbacks> &
      Partial<ClientToolsConfig> &
      Partial<InputConfig>
  ): Promise<Conversation> {
    const fullOptions: Options = {
      ...defaultClientTools,
      ...defaultCallbacks,
      ...options,
    };

    fullOptions.onStatusChange({ status: "connecting" });
    fullOptions.onCanSendFeedbackChange({ canSendFeedback: false });

    let input: Input | null = null;
    let connection: Connection | null = null;
    let output: Output | null = null;
    let preliminaryInputStream: MediaStream | null = null;

    try {
      // some browsers won't allow calling getSupportedConstraints or enumerateDevices
      // before getting approval for microphone access
      preliminaryInputStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const delayConfig = options.connectionDelay ?? {
        default: 0,
        // Give the Android AudioManager enough time to switch to the correct audio mode
        android: 3_000,
      };
      let delay = delayConfig.default;
      if (isAndroidDevice()) {
        delay = delayConfig.android ?? delay;
      } else if (isIosDevice()) {
        delay = delayConfig.ios ?? delay;
      }

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      connection = await Connection.create(options);
      [input, output] = await Promise.all([
        Input.create({
          ...connection.inputFormat,
          preferHeadphonesForIosDevices: options.preferHeadphonesForIosDevices,
        }),
        Output.create(connection.outputFormat),
      ]);

      preliminaryInputStream?.getTracks().forEach(track => track.stop());
      preliminaryInputStream = null;

      return new Conversation(fullOptions, connection, input, output);
    } catch (error) {
      fullOptions.onStatusChange({ status: "disconnected" });
      preliminaryInputStream?.getTracks().forEach(track => track.stop());
      connection?.close();
      await input?.close();
      await output?.close();
      throw error;
    }
  }

  private lastInterruptTimestamp: number = 0;
  private mode: Mode = "listening";
  private status: Status = "connecting";
  private inputFrequencyData?: Uint8Array;
  private outputFrequencyData?: Uint8Array;
  private volume: number = 1;
  private currentEventId: number = 1;
  private lastFeedbackEventId: number = 1;
  private canSendFeedback: boolean = false;

  private constructor(
    private readonly options: Options,
    private readonly connection: Connection,
    public readonly input: Input,
    public readonly output: Output
  ) {
    this.options.onConnect({ conversationId: connection.conversationId });

    this.connection.onDisconnect(this.endSessionWithDetails);
    this.connection.onMessage(this.onMessage);

    this.input.worklet.port.onmessage = this.onInputWorkletMessage;
    this.output.worklet.port.onmessage = this.onOutputWorkletMessage;
    this.updateStatus("connected");
  }

  public endSession = () => this.endSessionWithDetails({ reason: "user" });

  private endSessionWithDetails = async (details: DisconnectionDetails) => {
    if (this.status !== "connected" && this.status !== "connecting") return;
    this.updateStatus("disconnecting");

    this.connection.close();
    await this.input.close();
    await this.output.close();

    this.updateStatus("disconnected");
    this.options.onDisconnect(details);
  };

  private updateMode = (mode: Mode) => {
    if (mode !== this.mode) {
      this.mode = mode;
      this.options.onModeChange({ mode });
    }
  };

  private updateStatus = (status: Status) => {
    if (status !== this.status) {
      this.status = status;
      this.options.onStatusChange({ status });
    }
  };

  private updateCanSendFeedback = () => {
    const canSendFeedback = this.currentEventId !== this.lastFeedbackEventId;
    if (this.canSendFeedback !== canSendFeedback) {
      this.canSendFeedback = canSendFeedback;
      this.options.onCanSendFeedbackChange({ canSendFeedback });
    }
  };

  private onMessage = async (parsedEvent: IncomingSocketEvent) => {
    switch (parsedEvent.type) {
      case "interruption": {
        if (parsedEvent.interruption_event) {
          this.lastInterruptTimestamp = parsedEvent.interruption_event.event_id;
        }
        this.fadeOutAudio();
        break;
      }

      case "agent_response": {
        this.options.onMessage({
          source: "ai",
          message: parsedEvent.agent_response_event.agent_response,
        });
        break;
      }

      case "user_transcript": {
        this.options.onMessage({
          source: "user",
          message: parsedEvent.user_transcription_event.user_transcript,
        });
        break;
      }

      case "internal_tentative_agent_response": {
        this.options.onDebug({
          type: "tentative_agent_response",
          response:
            parsedEvent.tentative_agent_response_internal_event
              .tentative_agent_response,
        });
        break;
      }

      case "client_tool_call": {
        if (
          this.options.clientTools.hasOwnProperty(
            parsedEvent.client_tool_call.tool_name
          )
        ) {
          try {
            const result =
              (await this.options.clientTools[
                parsedEvent.client_tool_call.tool_name
              ](parsedEvent.client_tool_call.parameters)) ??
              "Client tool execution successful."; // default client-tool call response

            this.connection.sendMessage({
              type: "client_tool_result",
              tool_call_id: parsedEvent.client_tool_call.tool_call_id,
              result: result,
              is_error: false,
            });
          } catch (e) {
            this.onError(
              "Client tool execution failed with following error: " +
                (e as Error)?.message,
              {
                clientToolName: parsedEvent.client_tool_call.tool_name,
              }
            );
            this.connection.sendMessage({
              type: "client_tool_result",
              tool_call_id: parsedEvent.client_tool_call.tool_call_id,
              result: "Client tool execution failed: " + (e as Error)?.message,
              is_error: true,
            });
          }

          break;
        }

        if (this.options.onUnhandledClientToolCall) {
          this.options.onUnhandledClientToolCall(parsedEvent.client_tool_call);

          break;
        }

        this.onError(
          `Client tool with name ${parsedEvent.client_tool_call.tool_name} is not defined on client`,
          {
            clientToolName: parsedEvent.client_tool_call.tool_name,
          }
        );
        this.connection.sendMessage({
          type: "client_tool_result",
          tool_call_id: parsedEvent.client_tool_call.tool_call_id,
          result: `Client tool with name ${parsedEvent.client_tool_call.tool_name} is not defined on client`,
          is_error: true,
        });

        break;
      }

      case "audio": {
        if (this.lastInterruptTimestamp <= parsedEvent.audio_event.event_id) {
          this.addAudioBase64Chunk(parsedEvent.audio_event.audio_base_64);
          this.currentEventId = parsedEvent.audio_event.event_id;
          this.updateCanSendFeedback();
          this.updateMode("speaking");
        }
        break;
      }

      case "ping": {
        this.addAudioBase64Chunk(
          "AAAAHGZ0eXBNNEEgAAAAAE00QSBpc29tbXA0MgAAAAFtZGF0AAAAAAAAN6QA0CAHANBgBwDyv/LSoWBNARINuL4AqUzMySBANq/vx9dJPj1ZK/9Hx+M125znog4lSf4AAAAAAAnPmE4zQAAAAAAqcasAH2//gA+zYPzB8wf0ABuAA/P+OAAEtH559A7ZL92+dOXSFVDboCT2/Jy4TRHrMuwNb7/9gw6sAMlX5XSeSEt48bZSjX6Q7I/glJXLhkwU+a9okJ8AfSyyK5BUkAJcssGpjjfj6AK+HU//KeABIPcY6RYRjgrBQ4iARP04DqXY6JiTzvvSc7xzLQiwAG57mavcFfDbYFaoHbc0FbZku0bFT+kabE3y4Hzvp7vDkD1BsJoIbl+7fXdki2CdJkZC0+n+Ps+cNdmOS4ZiZz7CjPKKSnNAmzyGadLDp271tXuYmMyilpBcCFuAE+WiM6bwMInqLPFoUNFcGis4KdAIFZxH9esUayPwe0YJQ02PxOP7OuigBlnD/q3xBoA96XIaIh3hJ3Ke4j0Nck66U8Nk2Q8AxrRiK4qgeGCN0MONfAqifIfAbts/z/GffF1olD590vnqASXDgAEcNxjI4kAFhIUUAI23hHWloAG5frGIpwq7AAO+J6fAuwOiXFg9hYGBLjtwr+4SE2i80uQ8utTb1+HKnb9A0ntHkjHyByBhPUAAJTVZUiSspwEa+kjVCqAMl+Ihsv1/68AJ6J41BRDvYm8siiTaU7hSAoHvSBFcQoAOTDspl7NlYNVJBcpEB26WquBlxP7186BsrKcm/hKsJgBIrBWA5cl5dABwARw3IWSUQAWEhhMAznGxwmi5hoBvnYGkWBjGyjVIIzdm2eAkADOjmEHYpd6Kp9uNI/AC7qiP/EB+3apS5NDyuODSWXMq6STN0SobwAgBVmqwVwR+j/EWQVCPWBENq9HmT+cIZGoy0MVVkkSLMSnivu+FFGSruOl56XQs0J8ajjy7zsg2DPDxT9dy/7dOGWaGQk04btODApjrvJVheqcRfICaxUBwASA3CFR0qwiKJwE2zFNF9Cxt0Ed5yBLXILPCJSv5839kE2GJRiEezN3clHA2EaG4zM20tjvpKJFmu1XtosINO23awg44nAYUd2sj10eRQaGrRqd+JBJpWanE5O7hhfxNmoB2lxppjz5/uHNjxABYL4oj7zTqEEjIr7ibYTFSKaUzxg1yLZfbylOlHNIRntEZqwsQhppU1QQWoXu32KhOU7g3xEQAHAEcNxmkdCiRhIMiCYBG/ksj2RaFgKb7CEu7gIilx7Et6aLNScTc5qCBJVUACs23tcWGxKLMVhCxKv0aRuJAgCISkJSSrFK+3nP+0ZSlQFCAzvW4nZmqX9E8NPatX2fSjn4h/Hbo2Y31UlgBmhNzzuPQKwaTSbH+TZzHYf99eEJ+SyoIPopqJDmXxnBIZsORC4WJ0zGqcgPzp7BKzcrL/zrmFAKSAAHAASg3IYUkIQhQAhjLWeRAsWR47FEtOFhy1jK1CAMGfqq4hgKT85RzGwxSQLhTQW8ekdt2uQ8O4I4e2wkTuGHAU8uZi7gBvG+btsJPSBhphm1Tstn22o97WJ5HxHapeb45LqM8E8tF82MRQ7NMyH67TVpStcsH8mYMkJx90RbXXwT/N2gpYMMN/TBM48gAbfzjtSJalHwmbY64gkL8AAHAASI3BFBkoIkCQkGKAEd1UZ5Xrp4cLKWHbNmFpLWHig0JApIqqoZiBEOSnbiq5Wn8FerRfE9UavMilwu8yHfaLrcza4wVnXPWYTTNV0Daqo79crNbcvcDknriyqBQp72TJU8+OMdvqky0J8LsQWjPdiDejvAOwOcO8o9WeBfTK3x+cI+p8JwDqh+3/Jr3KIr5kZlDufls//OHIThLx1KzmF4BIAAcARw3IOkCMwkMJwEcq7cM64IRcAGegq01FgJlJNbGiL3fbi1M1/QIdIhBeLWBoUYLj7WDFSHBd4wvMMpLm4TFF1xCaxgya2IWj66+x+4mABwQAckzYdcsnSm19PEvKk44EiXk1SBYh0U980mscxir+H/vhqpaAiKrjn0ie0jxLoo3cz2Fwpg9YKeGT7S9GHyXgnKbD/l1y4/5gIatU4Lww7Pwriafr/EHv3bd8AsjIJMOxWEwA4ABIHcZiPEbBQhCMwDN4rVmloFizBnizLhEBkl+6Y5qfRzv8J9xc7oUSoZCq0l0uUj/Cr0AiQnhfP1DnMhYmw+7gkWYJhkofUzwnrZpS4aC4X4AtwyMV9XVJOx0IizYjFscs3/QZMUN4zVszsSotVYtkf8QEGdU/4rdeoAve0EB75xs1Cu1TgA3ujy39D1ux1Ycc8I1tLjzOAz9X1eDsdqIKjRzaVBq3WA4ARK/2dJRKQ0BbCWKQSCa3wyAnWtR6Xet9fo1x02pq8+zy6bLuZaBxqwAQ8jXrwmxEVNlERwYhj0D1G1P845nTqHP32hEo5HA9Xl6Jqjd6RmnlKZcJwuR3Bh1/4AgVNSJmKx2m69z43unPmDhEDm8+q+r7l45L7NcVDlaYsY6mIAtBznClI1ikl71QagdC6zmeKAiDnu6cFSjFpkta36+HtoCoKd9eK8ifk4xVatbnYPo8z6TFSrWV9R+3/ruX4ZyWAujBwsv6dVmeICypemPKrIp9e8LBidiO6V6+h9YyofdMvoc0mOs0hAA4IfiPn7pRiDUYjIA4AEOvk61qsBus6LQVbZqxaESBqJSgKE1PKQJw49YlbfTtvx+v/jT48HXbfnZ2kJb9vO/b0Trg3z7rhL/eZ4+A93dDd4SESbY0JzT9fSeRvaKr/iKFo4CksnKN4Sy3nQxbZ2V65R5R2FtoAEQO+aij+b3TKD6hllfp0IopA2BilJOhYFFtu0zIh36UQXWIqLRsdQHGTEFGDE5IWUQJMiAdbr5nbkPGh8zkUFSR1lQMVwz6E8ryXqDwDs6jv4QwVPaWVbSsB2+2z9t/7OziITE+iznrSpEJkLNQ9M/k6GdC3x/jecFKjb/ADb3G51FHV9J72ODSNJBsFZMncdx95zLlxzW0VNNRwIw72HzGHrsHXIslWlEDpO4jLg9pduS+yU21NbQGOQkQPsLDgE+9yDkShqJmINhAFAgNAkQBtd8x4VyspxbChJvrhnxqgFKOglO6aIQhVqBUh70OQr/+uFfVpN/RGVo9dZhZ2ViTNZXSyAR1iCWPoJ5FzwvxR7krkpp2izu4HJShPynkmSu0BxK1+ypmzRqd3wWDHNA4WZb1yVooUhCLln4ND6iczVxIgmFjPmXkAGTu4Tf433OOWE4WRkJbGOQoI/JiWVBIHr/0wK1CXopggT6Fd7ZutLVWcns8Q7VgAcBKjcg1BYljVsBUwDEKCEgCe+U7GbZoWMbF1Oh+tZFwLGIa/HplHfGPvZuCe7qqM0KP4TnIYU0p2xilLqn1agr7sRZnQvn/DVVnPw0Hd36YXOh7+jeh3yhfHhS19oxgm2LAG+jX1XETIF8lHZ93bwtPfE1Ubzu6xdEz3/7cUN+/vqb1igACVqCVHZlvf3qNWs0vTVjg2bgpk532ja1HVnpoorCFpx9zKrx4w/CFZaLT/i8QDzc3IgUABwBLjcg0xVMBMIDUaBYIiAR34Nl8nEWgYBaPrLlAUUo0ND8owjBT/YfnXCtj2P2jSRu67n8KSctmcL0HCKYVIjHRhU49jAtoYVr5R6T0U3PP5zixMQrIkzxurvDGXZ/L4Hfm8TOWTnOi9/3dearPZhB9U0wvcRlwtVDAsmy63yqeXB/+h+7AAAF3rlmP9t5z3Q+rsq5znGWQWTAAqhMttJ0LIpYVgq45PephWLz3X00pWGOAwTIRgZrU7fv/LTb+9PF6+FLAEJgOAEwNxh0VjIhgkNhuUBmJAkIRAJf5bDrZo0u3oCQt91YkCoXA05kwATqwIXpxZwBT4DSKS7+sQgVoXCn0JxrKnrOFDgrG6JKxLPznHBUQmcp/bu8rIYYYABCSLO+XdTdS7MRjHFjMbeTGQqYK38mhVwxw0vF+SxherorRxuERQABfpOr06iUKZuU8j+RrzVwJlPjr6r8x0n8h6B/96DQrS5C7larW/8JLPC2EgC7EV8IBcmQADgBLDco7qQzlMoEoMCcYDPtSObsOMewO4VHWnxu61oOgTS5E/08Fy4Ni9761kqb7PGW73HVeDC8s75ovPF0yDJLNuBAiHKDDG2gmX22ZEWF2ZVyPBw0We/y8LbLDkel66ZzYAAbqJm6VHdc15WeHlURIoEBAhxB4Peox4mrtf7XpEkA5wlCG+BJBEDnNx8aaSjKQyM2I8QUrCcSD5paVMhoNxyOz7VD3vVOXyNPJVxIABlGeGKTds23SNeYJArqNf0GWet0/x9Rw9K+Xp5bYLAHATY3EFRXSiYCxaCgmHQWEQWDQVCAh7mOhRfABOV+XGXry3yedRaaekcEchISUlxCoQ4ctT0SGhnfl7e7y09/tzNXnPMDiUIgK3dK8fgHF0l82eauSzezW4BqkRZ+6mzqdxaCAwm8EHLb0+ZFlRZLd1dWTFlEMOVGcpyooxny2bRBmiB2a+QaEliGPh/F5h9SpUMZLd3AYMYYRhpUFpPNqY7abTgigiyunK8bBOqaSZwNACuTzpg3S59V3HJJ7d587cHho5yjNQgUACFh10SzBeX28LjhfNs1LToUGOBCJaHjUGRPP9d/h9rqgDjb4KHb/fo/0nSz+rCwjb4hOiu1FRkvYTAoOU92RhnanZqsdWH/M5alyYv+P06AYhDss2Jvt+jq+j0/Po65n5VHS1F6pqgDgAEuNyjutUMRxgIyoIRAJrv0bBOA+AT0oya9l81CA8ABWi2y9agAEJgPWdDNlHRtrNvx8Cher7CCK6YAC8LwhzwZLxgxgkXZEeYZ1rk4mG7wdlY/ZlCI1/7qjqVvgSkT/n6Coo0ZsqlyTrQtWWM467Z83jNKMN+y2IGWseOAAS44czrv1uoEqyTjL8dswBHiz0J+J48UWTvbNbBiS/WtaSPa0mSsYUtTefyOnb0w48u2njFoXgAAcAEqNyjqwBoRhIRQgIQgFRIMRAJ43mKyy0zR+K3frCWntxWFWFK8UBFxlIiKALDnG3p1Gv2zliY+XbCdV9OxvpoAVN6AHACFrz9/8eytm+qqktj1VQiL185yIyCuB7l8Wq8aDH1sFKZFYkozVllJjMf/Ofqi7pYFPNzwjZelbxrStzsACa2vXs6Oz5d+tvBrrqrwiq1KnyUU1WBlusGR6FFAlPdfym+9FspBsru5K7Ak82NfDkuGOoQAHAEwNyZQMiQMxAIggMQwJhIIBsznmh5Fml2xmEj8eW3EsXjqzXH/jsNaWHUfThv6/QmZwz7lkXx/l/WwK2kyzBtqoctMeP7faiH862AQyb/8DOhWnLTyLYRaKZdUcIYZ/i0tyhgver447MBhfB+fK2+2AeFywpLOyzwbDOqZFfW/loQk5qzOcZSwSVPgilHLilBM1sqP5hq3kiRxEAIWSrdZxpaleXk+9Vk9m+UWMCNAAAAACKwKCj+0azSFz7bvnS1D+8N8U2j4hdPvYrF34AEuNwh0RBWYg0ZBwNAgJhCEBiFwoJgoIBJ9h7uOs0Vv2vlLZWJf3j2c304G/yXvJBgyvsnPOVi4m3FQ+0XH/T63iC5ogcXpw6iWEFOTAeblHCAoyZoGiuM2ArFfsdBnE5dbH9/exhDhGm01RGGf4eaSwAQAhdIqbCQWoDnLMEEuhoq4jgwcXUqAeefZ49FCO/qyyyyyy7/LlEQa/cAA80ABvz2+/19fbxff9vvz1Gb9HCx3zvAQD8o/v/bxMIhIPPuPWAAHSvqS2fO5ssuqVKe9u1JREEABS1OE6c/pu1Y+sA0+W/UP58P/5/LAHZwbQ3Q/qZxjUP1xSN34ASw3KPJaGpIGRDIwqCAzFAUCYmCIQEv5o8KADM4SRZ7Xfxp3k1QOODEAwEKEMUY/WY1Ccr14MD8l3qVILrWQQFzp4oyczFejtZATCyiyyzv1GcSM75GgMGGU1m6ny3TU+IwWbH+dHt9oABWOBicNCMeXgRa2f5/3mC+dg8ZUNKMTk0IB04AwR0/Idt1YAamApvmhAKryrHYYOvp/M0+T2FvqahQdLk5VEDLBuu7WBEdFMPSu1/FfhXKzVACqqqEQiy2+XZmNl3lap7DytUjvDBhy1CvyV0IuASw3ILYnJBEQw1LAhCBBFAaEgRCAWeCu2uQaWYzW7ajhM/mccgCCXTg63eAkNT8Ovwxqd6uYna1kLlQUSVHclOEe3gluNU4pNCi/CohrIpcLvZ5rqmepBA20u4offgBE+v364tc+m8XGtACsF4RdM98AOcSKhJCT6h7nJi8n+VayyqxzmCF9+UQBL+Dzfwh5gAOcsbiHnADlz0CA+ozp+Oo3HYSR0EQxEUQgB982wy3vqV6nHtpo7jw4wMQ1RhgTRInP1tmaIgGOvv92sEhH8e7WK3BQbkgNOUCNrA2OAABXsQXuhUF866hdi4ABwAEwNyUsRFwJhoOAqECwUQgFmHuccmmuixHoHQ/zziwhGU9d7Doa/YY/7PPS4/x8gJLMngk5+p34ziHfElnmcyvri4v2c+c9XX892MvtKcdkw1w7uxWWLIIYYOyRRM7rSybxwjZ1UKvZoWvA7bsH8LT4jJvdcZdieTP2e1JKIgqbmtRdr21FABznOctQDSIscYJN0xmFGp1GDcLWdE8Ra1GbQZKJttbr+0K21VIK0MmqF2XJthsYun+5+Ovizc3QETdPk+DQQm7/Vi0tcCp+USrG2kbTxTMUu32wwKYAsY3CSKGEAkKSVjnnumKLFAd9SYmDAWNRgGWZw3YAABwBLjcsyzgiCgQhArioMCASeqZ3YWuaeXa3jdjpM/57sDwYge09xoBGNuPGCCpN/h9i8s/uq8vfwSd24o4MUBF5YdswxKll0vcYuYx344O/HSg0X4rOv2atpOYdFA4AALbIy7+MkTGnPzSRklrdxrH3mhTE4JU1jEY4DuINZd6huCqVyVLjiZQACEAACspwx1Z+brfr/G6nttD42hW+ozhYLq7w4WeMVlyYUKfZ+hrIVEwjMy26/rNr0La++4KmUtbKskl8v2aGUOQXrp3k9rlaaG5Y12by6mRjYXEFOSRLiX6Ce9MpMyXvV2+lgoNiCIoKEIlDUcAHOcHgATA3KShVXAxGwgKIXCgYCYWCAnOX2LLat1wNq9EPMf5erqLcRsckkjiUDjqoACcP5V0FSDFE1FBfghRd0kl1z9OJXgYopkKqs0UuSbxLCYd/dObs4BPPQ4YUcOTsOeSZlSIFCpPhAXh7ZuOIHiFPgbV1EISW6dNJ/14VyGeCgCAxXPw+f9ADMBTHHwcfxeD8X8303/INhqowZb4NP/1WNSSaMnFZpVWp2Q66buNvcTdHH71u9hAsFimwT6r/mtKJnpM64o+MYK7W1ENKEJ4zW1IAkIBwASg3EFRGORmEQoIQgEwkEAhGoWEYQE8DbSa0fCw7ysUv62fGjYCJeLja8oql2XhMqFqy4mjvPOTUpAoXLqj8uvq8IKqTZanUe84/9ePgs7qdW2MYqiYike77uruKM9CZYPpnUribXy4HABGqioFL2bZd3fOprLUJxAC8NdqsKGxb+aCkMUyAaEJJLyl1hCEN+rWnqDPT956aKkuAk3r7/R/z/Xn8taazoKb/2o7JTCjTtW/woA2AYhRi7JFJr1e7KAOyUYuy8v++WgFA18//tEGPoHD0//n+2wA4AS43LTSIVQhFYmHARCAbFQbEIQCm8d30S9dOAzdZW86i/OU40+K8VrAeOqiQ50BV69lENEekv4ZojXT99BQk+LTAqzx5f/gSAzrf0eOoYc3Oe75cQwFh2hLaQbNptRkklkl08EQ6xGQjpp5fl0lhQJscz2pIpxe5vKfMx8zdqzU4UxAgYrKiH3/L69sKFOdUtE6WuTgA4gHf8RVd1sLEsPdyO6ves+YNw80dpf9earMB1Xu1q0+CV7PTYX5VN0vzcWQiBVqzsUoSIi6ISMsssoCMskzzfv6m7OB3G4qOBuHlIMMAM5Y3Cy4vNiwgHAwQ0cwEE5h9eakpu/6p+e8Z999z5VosFG+bVR8BePQ2hO5Oz+bd7yV4owv95gc2U99b9g1VqqsQUvzXT8viY3Kx1msD4347HJttMpRU+wXhXMhDXVKRwSnMaEhwUoQDAAAA0UBRkYw6BE/oLT1Gp8y2VB9Aknl7asTntXhbntqE6ChhMxa9ze73dI2oIzv7sOpzGM+YUggAAOABNDcoyJUjEQbDATCQNBYKhQIBQTCUICTs9UPLPKDpsjKefGvJ1fbWBEksCbjlbRfReuhiQ7/4Zk210eSb6HAmf3e/SbsAAROVVUi2Kyqpb8kDMUdsAHxZl4i5EvHUKwu7tsxmuwnGGIQAGEGaDVkr4j1sEi+DaLQzpoqc2K55WKSEIL1aMnc9Mtn4Ckk36crhVA1rhaJyw3WHPU+75dc1SKAPkW/UK4gAopGHDxFwHPGceE+a9UMl1xLRPmF1a2oJ+H4lxRRbG+6AmYAeyYItHWdCv/v+wVuTCAACKsToJ2HPlGR2VHXV92avv7s3WK7K33zStXOkAOABKjcszuYZDYRjYRhIIlUIjATO3bEcCLtx2JzGPMzd9PK3awsAWKzzDNRCxpK7n00ON5iNL6Pfrrf6LDM8noMF475QxmhryTu/9PMBx+rpwpT37INnYou7+vaAIrCsuhXCUQjHwk2Jq+f47AB230dQSWhBBq0Wmj9dWYrV3eMk+N3/MOGgDvv75fj4T/DxAeFGADE8mEABMh8MvEAJVGcliLxPv9mOPZ9f0z5vJ4fJ5sAw5MTyUj/ADEABNjA4ASp3KM82IYpGBTGgWCAmc9u8eSB0xgcb3bzpP860oLUkYOF6cFE7b0eSodVwaOX/y006/V9pgT1XJS16lbOGRjArbcMNDlUNmE2EiZFxbDZ4zYfs3iliBHWgIZMkV04c9DwYACgfndmTCeKRWrEVnuuKaWp9u800eP2317hXkrIG32fp8ZYOKgcgBwiOvak1+lc7aNGbuCwmpI47EFbo/OOO/89wEpzzOLLpul9Hj1NJixGRAKAACHABNr/WElPgDCTK7KoDRawVKJybAnFsP3+L45r/w832l6+8+v6fH9Hxnc2j47WE+iDHVlDrJrMwZwokt7jsGxe0ZY+pbHNcUa9/lP53h9Hk8DxGg5TZzDcLeK3mPJD7H8JUR7HtqfEuhcDeKNWM+rP+lVFRv2hs44peDFm34G56sNLg0UpZZx6bihcMvUkPQf174soUoqSMT0n0f7/bdCLm69fo6AAAFFVlx8rxj/8LoN7m5FQkPt6ZBX+OE7zzPCVqNNIaqUVUIaBMgkey5YPEPcvCaC9cbfVJyr4XBhYo0vaYqlfttBqCnKOAASa/ugq2aYyBYqmhokbAt0kFGuM36jxxbrrnrr5fLO7tx/L47903nrboHUDKbAVVRvMckOAQqFay2azfTtZj3peVYZQ0cBBSN2MWkP7OB7HxZrurUii/Jj1Nwxi1PKvgA67a7mR1V/g8im51PS8ZPmF/C+syPqYQH3b6VoJOQEiUghJAverxrTusKJncDQ0+4hWyXs7/6y3XuT0MOycLRn5RrJskynLLsYe+9U7dl3cO0egIbEz7gnHPsViqMVjxB28i7mbzMbBS/hcREJBP2mW3fmCmnFv9y4swlgAcARj3BGyUUwUOImChRMAgbQjNMDk9CclM5GIlg83kkk/mKIEPhmYJTwVVBp+3QNuINh96yCrBfD2x02ERlE/Ol+JK5Ofc19N2P6+qhcfGoO6iYfXiQQKtqz9zNeKpfUcIM8QF6dJ5uFLI1aSnJOQgCY9IF+fO75WaS0l+8/g6S0mzi7ut44a2qNoN14EbcdQBt9n+3b7hSFN9cl8aC93zgfl8ecAkAC+LHblBsAAHASY3LjRULARIgRCQhIQREA364ni6504qDZ3PGYX21fORV0sW4XY/4QRUHgOT0k4s4nUrE71snWm4GLnf3T/wqhYQMHbmdAf2M4fX+6yYoROthieCuk6UOZx+rk2wCQTkJ1UhQkkIkMhATdgv8mzSYkE0C/RWfg/7eywGjwoT0ejvqoLxvTbRGM771TRT9SpfR9H1MqiMMkyevZW15GtrFzlIMYd2/+8Jt/O4DGy1664a5b+qdacL6Xv7AM0Tnv79vN7kYPpmahf8uyICXiy43/P4Ww+aACXo/Tx97WqHic+huEQjdDh6e6KuMfNiTmIoDKXvfjpVcAEsNyxwi1oVhIQSoIxgN16+VuG8cyurcV3CKHWYvzpjFAB5Hf635/MXKqtl5HvosygTJ0c02CY4/V71elaa193ryU52+95/TG6ecsBhmN0qx4sC08MiGfJAqtpc/Yb/xR0rRj5ZtaIzWAt0EoTQuvXENh+GVByCIavT3xx4cJwJ0DPK5YoP/Rlq8diOo7/M7P1D9JRbJwR4QACX8AMuDwgAGT21lA7L27uLtNFepLhzqcV1dYEBRpPpUQJu05k67ym7vz6S4ZztK6qS9kfOm9JcATI3ILYXawjMwhCgxCAxCwUCIwG7odrem0aYs8tKOB93MUDDMIHBLWUdl1HNHRlEr4WWS9voYTqf9PpZXjjraSHLxsyyBQ7uUdn3VGgSqJzlL1HDqSNFzpwtXThLizAxBESyzzzoosi00NYp5/0PYN35lVy8NgACgIBK8AsWGzEdcBdt84Nr4GMTNyNHlYmq8K+nHAIAxcq+bxXBdLDEAOABMjcgymoSxQQhAYhgLBMUBQIhAJunpbO7YRoGhLlyfr13egHBAJH5gCCKx87gX8sF+vwjPxyHQSRwIrFeeS7+GYNVAZI1yL11fTNzjhJu4AK2WStqCbQNd0t9v+PDtI3ASFQi9SAX8eyAGLOV8S7T4DLjdrfIAAUEITlUmhOCEBTQyl34/W8Dp1yejL+3wq8bSrkkEwcBY0D+9/zXdYgAGJzeUn0V4RQ3kj6bOucUEMqfimRZcIRnAICeQSWc1PZh/2AttIQHiaVpwMtwitiAAOABNDcoyzQgiYQhAgjgShATHeMO1Z5dGhOxdnB/OTrYCDBBCZSHEe7M+X9EL67V7vfBnMEvd+qS/pgvFAu5YqsxfJmFQznj/97IK1K692dy6qGtGGqr97uhqqXScaP0/fPLA5KMWJEQAJMzeZ99yFw7++e6RGPd2AAS8X8YyweI8QCWkPn/T+nz/owwYcGRiI7eN8ms0/t6+42iNPdgby42RaNgkTAS5DEwI6CgtlpjUOnKlw9+bBFirQS+yOX1Rvq6JuecXiIVg3NwqYOAATZ3EFRGQjyGhIComGYgE2V4NSRGfTp6w3yllrvrqMvndDx5g7M0fK5OUnZp0I/JAJXrnAGjE4Mj7vUs68IG9qLIN0soU74sotwcdrAd+LJAcMgNcxjxp3DGzfzQw9VWx547GFVtzH2uaddd1AK6HzIL1HpVDo/r0d2kYbPwO7uPLGHt+f/H6QB3lb3fU7Q9RLq2zoMMGUwwH6I18vl/7/////QuL1AAF6hrWoN7+Px+OeeeeeeeeeeeaqIADAhFFGU+XVdCIAGAmasWfZZ42ZXElPOQ+dMzIeLTAhoDGYgXI6yJi8LixanWOCyANcTA4AEyv74KNimFAoKpIZRETYFfUfJ3q0+vXU7Zy5HsB+lDKHWTdNEolQwEIgUc6e0LWuvavyLHswOvK5x0cKu3dKMCnxOpafMFYQI7Zw//1D+mwzQzCPZ6lPBnmjgBiZi7WacK8HZndlB+H5yLUeqvo2FWzWNSq8yyBRFH7cbFttReuCCyZLG2cXaQsOORooV9baGrSHZMr5VzTmDOYOOW6ySxydv+PhYCl+nwx603bWM4pUlomgNaBwEa9xkkxBkQxkNgmkBHfehgAGN4NqVjcUXoABmWZGobVfaYM8ChHnl00fOjEKmz5WkheavJaK/tR0zDfPb2ukIgZYgzIW03xWJMkksFNJwfZV/PW5ShOSG17p09GAQdSzGIQTc1jF9B4eh0UdUfk4o/orb0C1cxzep6Jl86dTcLR6LPsvv7NmF1m+4ooRCcO1lrUiCTe5d5XcgGlY1gABwBEDcSzDI6EFACM7YGFAE27DG0EkLDz/SKv8TfkfxorxLX2btBvEYuSvCfaJWQjrTM01jvmaCUkA5JDtTjb3L8n3++d8APMySeNoOB1PW9+A4zB8h91Z1vlTG4e+xmtcs9UOmZpcE0vGG3CjYkWbOsv/BrXSJQwxCgBXl88vhlLBvjBReX8M/0EQx3qI+ZUWACQIgAcAEINxkJBhIgSkESAJf7WAerBwdsoZjaltEWABxMYmu7dhVgFlyeinjuOA/29neEn4jQp3wFdHmR1xCQVjTwguIx1PeaGp2cQoNJr6NpYUu1CSFLwtK0HOZQ3qosJ0pkJQZ43XpYcLwXZNVbL13cjglff9vHulyC8d/edpfTbeNMK4Wg4e8AT10cfVfpnCk0r3xaeQB0cw3yAlOKdCkxeHxuABwBCjcAMQASEUgjQ4nAT13blZN4PZ2di5zighahMoUJdWlibjl6+g8MaaVRJnquNZy+3oEHbfQhqyoKiGeoiEtRnVDdLYTzLzRj038uv7BW93E3XL73xxEr03AiMb9emBZG6ZEJpgYdQrOywr5aKAWHSHjLkfXgGeduEYTzYDsltVDg3bVdV5G1Sga05ij3VtXU2TAo/tBPJ/6mYNmuZAB0gAK6mnB6AT/PhvmTAAOAASA3LkZ2EpmGZ1CAj3MpkS2dDXdOHWeCt3Ppm1j7gVWUqsRbzaoyo+l87o+xQlZPMnK6hptdZMI64FiN6XNz5Mg9bzy+7vCTJLop+pfCIdqkAyqIZD6QyhyCyVd1oBFjP/MM+rEA6Lykzdb2slFTmIcTe1Dc61n/GKnbUAFm60mt1P3+md30RKBMgJTV9Tc0IldpQEkGgT3XSFZZdq19dcvmxDn8ENmQHMGRmQAHKxZu16L1WWDdUGTivAAccNh12Ld/cuiAANSVdLq+v0bqAHYsGO05c2FabvH9vy7v3ft1S9kgAAcBJDcdVmMgFITCILCIQCUYiYShATxnuyAQa0/G87sT73u7sHocT1//aWfWf+OedqypcD5NOo2SDC2EVNNncMZNoxu09ZoZhOiKHx3k8EU4BVn6c2QYIQFXbyrl2SKMAaNMR0MhSBRio/DXnk73TqgOAqdBBPGJ7RSLcgq6AAACqvSG/q9309n+lz3dm94ReYBZiaU+EMjCAAHkwnr101eyb38e3+Ours7PxKoWxdAAAIEuamGWzZTXZpWQCBwgBMKUzU+X0+K+r5QUAAAOATw3JkByCxTKAUEARDAWC4QE1tv36NiiX/lyCPPnelWKZYavWXv19voZWVmz+96MVqfLOamvZaVGfxnFnr9/3TQwjMoX4EZ2ZqBQhAK+P4lP3j5jIind2GsRA5GoBeskRw8nafRf71LdQcTVtL/kl5aQAE+2AO6nqzpOMGOWfCt146S4VTu7z6aQ//01zBIwhlTgn1nZ/Lc4ZYHPABCtxzuWOIsB+HKiUrM4mvhQnAEFWpVJqt+rreL11e/0+Vya5lpLoAA4AUI3HcirGwTCAjKAVCQkDASCYQEHZGZyFur10v2v1vf3GuubTmwUcy79fqpJzU6fAkecNoFqfkpp2n/bM+Xv7fQw8Mncy997Zvf5hSPX/E6U+uZMHQA8337BwaD3AwoWNkfhjGa78Hv9JrLZdK63C6U4bcTcvtek3gACejEAABVR2Z1Hqds5e3EgAAGsXOPCedUIGGizMaLB3d6nPgZwdfiNvA2P2maRd1JSAOEgsDoYHHuzcO8i0cdBoGMR3S/KefeU6Zv9CIA4ATY3GI82GZAEaVCIgEzbnEeMZbjHAeYa4fq6G8KoFC338BfP6/Ag18kK5hx9IXQuRekEhowa/E2zevzyJFyCMDL0eEUBh6r2bHQwBs0rhcXFW+r9G0+oqBI0ulYsvKCNuu6Hauyu7auyVzoybyJMXakulU6X1XTfiuGyJfW/i+S/pf7L2fVbYGXYnWG/ik+gfcDfL478uHHz6ev5dWlTgBdMN5gJBil6Iy/VwAOAATg3EJQloZAIQjIwXCogEejYbGdGWOkdaf7DEyYENvgWs+5qAG8Cf4+3Cv4Zg75GBnthDeS4Ir6+2YicigAIz8+2Y115pe85OaBPY8rJsc3WDKHFr5/hJPIGsS5UV4rQhcceFtFtHov3l2eawEN7vRYEqA7iDh3duEjUzIZIKAeOMxqz0WPU/e/i+90cYxUABV1iJJixS8d1ax8fRXt5/p8vo6Y489THs5Y+7PfmozSrjcMTQcABOjcQlhSwCNMBMoCZh+fpGLvSEjQn4uFlzni5gjT8esWfiDwU3Pr9EFbLg66E72XfgtlwtD9E7uEbVuqd6T5uzFCxe0TCxnI7xy0S4U42GLXG7c/sv7B/s4yzNa+tp5+kwlRdPTTX4s4RDCrZtykOc5Z1MMMES460bD5O4/p/5Wlm5/IASdM9//Ofw/X0ycHZAaTNEVjmMszqbzN1m6V0v0z9rteiuU3QJpDgATo3JKjGIJGGIQEgiGARDARGogEcnh7Ea4dGDgD7mkd61qhVXjy7h0///qDqo90zJPfqgqndmbEUj9otbnowmEJBFEWGccjaAAd63cNDPnRK7PML65Fy6uwEhFlGCGGjhYO+NLR46DCQLR7vVF3HElh6COrEt6/48IhzjuOIRS2cWVJI235vC0W/7OtwUwgAyU6YgABKUQm1ZgwAkXmuc57+rfX9fZ3Y6LxqFxQG83JaAcABNDckqJEqHYYkIIkQIlARyxdqRprq1jTOYiOksWugpnozUe2+s7x4QJvuXfz6C7sP/NUILoLeF7QMiO46kwojmHMskLlqCxcAKqUG6G5HNjTMbeDsD0AKFwjCE5KfnPRRVUA5RZeMqc0J3Ng0KF7NaFxw3ZEc76aI3yE3eHK9e/j1QIn+/9AA/oJ1nqI6+UfnWABVlNgEbO5hSXADgAEUNxmCZDsIhGIiigBJ+mvB0bDoWAGo0aEmgAErBz65id3ETAKfNi1buGR5P43cRCogxoAVJQwygYACD22vnpDPPp0llAgiJ4Io6zUoxVjHKFuguwxfh603XGPSV4Fo8aPUw0Z4GzrfkcnK65qsEykQ9yGDmLMGOGyUwsnzhDIyoc0E7CeaAFjHamzcEuYjHQAMQCAAHAECNxjJURkMVgI9M7AsRhsEu1rLGpcAAZrdU/dXWD8tJkf/kFk8AUvAiKNIaMWqjrnRTSZ3dp3BTViXWqvmv/FZBeFBSRU15BZgqyyN+cZ5j8NxaBmdpGRomK6TUvzexpxEoYt99i9TpafQ/COHDHS9efHrF2JNFlAzgb/NKXvgsRmGV+iknUUJTARKAADgAQ43AEykaR0ERBMAlZmBrGiIWARArRqA6z5T9lEEMGiGLy2MLZSjDttCqPwZxFO4mIsyNujedDQYZeOyqvVBgUh+TH83gWAOTBac0fHY0TXp94lu6jT2dCvvWAbwWu+SYovWaT3w3qw6+61QsBM4I/QCGC8nfE7b5lCxMIVsnQqWgfOE4JLoUagGQiYSVd4BYAA4ARA3HKkjOSBKA0w99FgWJA03CEsjiAVPCrVfLN0qR5WrGfeOJFQ5R550KI6V6U0p6bCGe/dEZfYbJCXRzQljjHtYRtYXrLZMBoKPZxOSoJ/U4E7JuoEbtvoWMi2IArzsrT7K8DE70WKOuXywTFqLcnHTcRcykV7xr+vRO4FAAvaDdDDCeDLa8PgROOH6X+iFHAEMNxTJIkCsBm9zAgIFhoUzViOIA1HGNX9fd2NB44nq+mQ7yGFxWZq3sgW2oJyeIQ9iDBzFfU6fm512nWoPXYnww54AtuUSQpYmw6Wivwf8l3s9SxYjaqOXFDdvRzZF5dH2hKLVpvCfr4YLK+/UalPMiBmoKqANjPeF4KZajp5axzlAFYVXkBwBEDcETGRDBIrDASCIwoAZgLbjA0bxPgILhNAkr2nZT04UpfDes/Qp8O2lPe3SiurBR66GFmvO9Bj0O9HQaquijL2mdQtAAC1MxyfQ9rJKD/w89im0z87ul9RruQa7wZ0s6GGtlUZueuwaVd+AujtwOnZmnirLr3tdT4K5ciue1+0VtveipIiQJ7BilEaPhXtgv3qxjPVKXUGfmOABBjcSzCQZLEoDPnICkNIA1AgXENB6xK5/W9igu8xQAteKAyQpWEiOElmEby3irVKw3GJtr8ABKWRpsMUVSTBDzO2s/SfT4tOdKOyTbRY21oWFXVtehuFk5BTx+GKqQ0xIzLSsImeUYGACKkr/zSWyuJSoA+fzdXZUt4O1a5LXrsvFpZr2RvtzZIi0xMBEx0XiBwEGNwRMpCFUTAM75B20I6ggAiCy4Fiua+uW58gMmi/CUUTsGjNRnHS2e5URYoP75fMDh60YHb9jP0KZeqfEtp+LBgpl7COUAqDOfv2ceyCKdLDdYANVcAGGJqtZXoXcqhAgdoMCdCunNAiayilzdeJ+tUYRdWi1W5+mLl0yWyKXu+HEQ4+bluBftEt2AKBwAQo3GOlReAzs5PGiSD4AJkVCJpLsAAKlCHntuSV6TEPD9RNA7tJg9BVqzu6KlVKRh0iG+76BLERVe2yphHnegeeRw7R8ljs+0KyUtPk1yHk5PtSWaXE5ftCkusrsKl8U7Z86Y9uUcbzmAkZNdSKdrVQjUC1aWNEuYStK2ExYgS16f6bqaUY/g4uAAQg3BIyEQwhURRMAzeMTlAaEwsNQpdlrgT/5SrxruwIbHvQ6K+4mSoBF7mT51UgVujRb5/jnLHRK3MQNTBw/N1StKWf2WfhgaPsqV2lpN+q1Tz1wKv4adJkPiAASqYfGQ93cHjQij2AJ1yFPoJn861E3ezyA+q5f881f7a+QR4Y7TSLM2G5yz/GF9aATmTAlccABCjcIjHQ0FEyBJAmAZ3ikYo6c0lDSPJULVJLAPy8L+rdAqc6s1w6S83RWXhQVTA93gbE5QRzJ5C40LXNwEPjWcyCBslqQS+KuIEWlcjRTsYLQx2xogmmdYBHhvGZyXowtQytAOxCU4FobpkbwoisZKaWpa15RDGYgUibwXgtca1SeIilzBp2RdlbbO3ZcLgOAARI3BEyTPBBaSBCAmu2DHKzpjBdjyLLXaLoKK7BvkWiFKDWSZwg+mcC5bzqE83NOFRRMVsB+y9Pm4YoDiEPMVLfhGH01rhm4Xrd14UhQwZ23NIdEvdaNI6pKb/TI2ETMid8sTCBT0Kd8AQOTKYq3R1gXyn54bLH9xXYOSf+rxXX5kfyvCBC362gz62GClKzQgAemTp7f+1xSRqHzKjFsoAAHAQQ3EuFxOw9cI6N+R0tw0yj/ic0KChqna74KOvD/xWXdkUFBT2goL8VNVjtbXMrLgqn4AAAEq2hvb3YAAABsbXZoZAAAAADj4Juu4+CbsgAAXcAAAQ3+AAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAL0dHJhawAAAFx0a2hkAAAAAePgm67j4JuyAAAAAQAAAAAAAQ3+AAAAAAAAAAAAAAAAAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAACkG1kaWEAAAAgbWRoZAAAAADj4Juu4+CbsgAAXcAAARgAVcQAAAAAADFoZGxyAAAAAAAAAABzb3VuAAAAAAAAAAAAAAAAQ29yZSBNZWRpYSBBdWRpbwAAAAI3bWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAH7c3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAAF3AAAAAAAAzZXNkcwAAAAADgICAIgAAAASAgIAUQBQAGAAAAH0AAAB9AAWAgIACEwgGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAARgAABAAAAAAoc3RzYwAAAAAAAAACAAAAAQAAABcAAAABAAAABAAAAAEAAAABAAABLHN0c3oAAAAAAAAAAAAAAEYAAAAEAAAABAAAAKkAAADpAAAApAAAAKUAAACmAAAApwAAAJ8AAAClAAAAtgAAAKkAAAD3AAABKQAAALsAAAC6AAAAyAAAALUAAADQAAABMwAAALcAAAC6AAAAzwAAAPsAAADYAAAA7gAAAP0AAAD6AAAA1QAAANsAAAGIAAAA+QAAAL4AAAC5AAAA6wAAAN4AAACuAAAA9wAAANEAAAChAAAA0gAAAM0AAADxAAAAtwAAAKAAAACVAAAAowAAAK8AAADmAAAAzQAAAMYAAADJAAAArgAAALYAAACsAAAAswAAAJ4AAACWAAAAjwAAAJMAAACRAAAAiAAAAJwAAACSAAAAjwAAAIoAAACSAAAAkQAAAKIAAAAzAAAAIHN0Y28AAAAAAAAABAAAACwAABBUAAAkEAAAMuIAAAEbdWR0YQAAABxkYXRlMjAyNS0wMi0yM1QwOTozMjozMFoAAAD3bWV0YQAAAAAAAAAiaGRscgAAAAAAAAAAbWRpcgAAAAAAAAAAAAAAAAAAAAAAyWlsc3QAAABzLS0tLQAAABxtZWFuAAAAAGNvbS5hcHBsZS5pVHVuZXMAAAAbbmFtZQAAAAB2b2ljZS1tZW1vLXV1aWQAAAA0ZGF0YQAAAAEAAAAAMjQyQ0RDNTAtRDBBQy00QjFELUEwMEItQkMxNTdBMjRDRjY4AAAATql0b28AAABGZGF0YQAAAAEAAAAAY29tLmFwcGxlLlZvaWNlTWVtb3MgKGlQYWQgVmVyc2lvbiAxNC4xIChCdWlsZCAyM0I3NCkpAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAABAAAAAAEAAAAAAAABKhtb292AAAAbG12aGQAAAAA4+CbruPgm7IAAF3AAAEN/gABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAC9HRyYWsAAABcdGtoZAAAAAHj4Juu4+CbsgAAAAEAAAAAAAEN/gAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAApBtZGlhAAAAIG1kaGQAAAAA4+CbruPgm7IAAF3AAAEYAFXEAAAAAAAxaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAENvcmUgTWVkaWEgQXVkaW8AAAACN21pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAB+3N0YmwAAABnc3RzZAAAAAAAAAABAAAAV21wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAABdwAAAAAAAM2VzZHMAAAAAA4CAgCIAAAAEgICAFEAUABgAAAB9AAAAfQAFgICAAhMIBoCAgAECAAAAGHN0dHMAAAAAAAAAAQAAAEYAAAQAAAAAKHN0c2MAAAAAAAAAAgAAAAEAAAAXAAAAAQAAAAQAAAABAAAAAQAAASxzdHN6AAAAAAAAAAAAAABGAAAABAAAAAQAAACpAAAA6QAAAKQAAAClAAAApgAAAKcAAACfAAAApQAAALYAAACpAAAA9wAAASkAAAC7AAAAugAAAMgAAAC1AAAA0AAAATMAAAC3AAAAugAAAM8AAAD7AAAA2AAAAO4AAAD9AAAA+gAAANUAAADbAAABiAAAAPkAAAC+AAAAuQAAAOsAAADeAAAArgAAAPcAAADRAAAAoQAAANIAAADNAAAA8QAAALcAAACgAAAAlQAAAKMAAACvAAAA5gAAAM0AAADGAAAAyQAAAK4AAAC2AAAArAAAALMAAACeAAAAlgAAAI8AAACTAAAAkQAAAIgAAACcAAAAkgAAAI8AAACKAAAAkgAAAJEAAACiAAAAMwAAACBzdGNvAAAAAAAAAAQAAAAsAAAQVAAAJBAAADLiAAABQHVkdGEAAAAcZGF0ZTIwMjUtMDItMjNUMDk6MzI6MzBaAAABHG1ldGEAAAAAAAAAImhkbHIAAAAAAAAAAG1kaXIAAAAAAAAAAAAAAAAAAAAAAO5pbHN0AAAAJaluYW0AAAAdZGF0YQAAAAEAAAAATmV3IFJlY29yZGluZwAAAHMtLS0tAAAAHG1lYW4AAAAAY29tLmFwcGxlLmlUdW5lcwAAABtuYW1lAAAAAHZvaWNlLW1lbW8tdXVpZAAAADRkYXRhAAAAAQAAAAAyNDJDREM1MC1EMEFDLTRCMUQtQTAwQi1CQzE1N0EyNENGNjgAAABOqXRvbwAAAEZkYXRhAAAAAQAAAABjb20uYXBwbGUuVm9pY2VNZW1vcyAoaVBhZCBWZXJzaW9uIDE0LjEgKEJ1aWxkIDIzQjc0KSkAAACXZnJlZWljZS1tZW1vLXV1aWQAAAA0ZGF0YQAAAAEAAAAAMjQyQ0RDNTAtRDBBQy00QjFELUEwMEItQkMxNTdBMjRDRjY4AAAATql0b28AAABGZGF0YQAAAAEAAAAAY29tLmFwcGxlLlZvaWNlTWVtb3MgKGlQYWQgVmVyc2lvbiAxNC4xIChCdWlsZCAyM0I3NCkp"
        );
        this.updateMode("speaking");

        break;

        // this.connection.sendMessage({
        //   type: "pong",
        //   event_id: parsedEvent.ping_event.event_id,
        // });
        // parsedEvent.ping_event.ping_ms can be used on client side, for example
        // to warn if ping is too high that experience might be degraded.
        break;
      }

      // unhandled events are expected to be internal events
      default: {
        this.options.onDebug(parsedEvent);
        break;
      }
    }
  };

  private onInputWorkletMessage = (event: MessageEvent): void => {
    const rawAudioPcmData = event.data[0];
    const maxVolume = event.data[1];

    // check if the sound was loud enough, so we don't send unnecessary chunks
    // then forward audio to websocket
    //if (maxVolume > 0.001) {
    if (this.status === "connected") {
      this.connection.sendMessage({
        user_audio_chunk: arrayBufferToBase64(rawAudioPcmData.buffer),
        //sample_rate: this.inputAudioContext?.inputSampleRate || this.inputSampleRate,
      });
    }
    //}
  };

  private onOutputWorkletMessage = ({ data }: MessageEvent): void => {
    if (data.type === "process") {
      this.updateMode(data.finished ? "listening" : "speaking");
    }
  };

  private addAudioBase64Chunk = (chunk: string) => {
    this.output.gain.gain.value = this.volume;
    this.output.worklet.port.postMessage({ type: "clearInterrupted" });
    this.output.worklet.port.postMessage({
      type: "buffer",
      buffer: base64ToArrayBuffer(chunk),
    });
  };

  private fadeOutAudio = () => {
    // mute agent
    this.updateMode("listening");
    this.output.worklet.port.postMessage({ type: "interrupt" });
    this.output.gain.gain.exponentialRampToValueAtTime(
      0.0001,
      this.output.context.currentTime + 2
    );

    // reset volume back
    setTimeout(() => {
      this.output.gain.gain.value = this.volume;
      this.output.worklet.port.postMessage({ type: "clearInterrupted" });
    }, 2000); // Adjust the duration as needed
  };

  private onError = (message: string, context?: any) => {
    console.error(message, context);
    this.options.onError(message, context);
  };

  private calculateVolume = (frequencyData: Uint8Array) => {
    if (frequencyData.length === 0) {
      return 0;
    }

    // TODO: Currently this averages all frequencies, but we should probably
    // bias towards the frequencies that are more typical for human voice
    let volume = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      volume += frequencyData[i] / 255;
    }
    volume /= frequencyData.length;

    return volume < 0 ? 0 : volume > 1 ? 1 : volume;
  };

  public getId = () => this.connection.conversationId;

  public isOpen = () => this.status === "connected";

  public setVolume = ({ volume }: { volume: number }) => {
    this.volume = volume;
  };

  public getInputByteFrequencyData = () => {
    this.inputFrequencyData ??= new Uint8Array(
      this.input.analyser.frequencyBinCount
    );
    this.input.analyser.getByteFrequencyData(this.inputFrequencyData);
    return this.inputFrequencyData;
  };

  public getOutputByteFrequencyData = () => {
    this.outputFrequencyData ??= new Uint8Array(
      this.output.analyser.frequencyBinCount
    );
    this.output.analyser.getByteFrequencyData(this.outputFrequencyData);
    return this.outputFrequencyData;
  };

  public getInputVolume = () => {
    return this.calculateVolume(this.getInputByteFrequencyData());
  };

  public getOutputVolume = () => {
    return this.calculateVolume(this.getOutputByteFrequencyData());
  };

  public sendFeedback = (like: boolean) => {
    if (!this.canSendFeedback) {
      console.warn(
        this.lastFeedbackEventId === 0
          ? "Cannot send feedback: the conversation has not started yet."
          : "Cannot send feedback: feedback has already been sent for the current response."
      );
      return;
    }

    this.connection.sendMessage({
      type: "feedback",
      score: like ? "like" : "dislike",
      event_id: this.currentEventId,
    });
    this.lastFeedbackEventId = this.currentEventId;
    this.updateCanSendFeedback();
  };
}

export function postOverallFeedback(
  conversationId: string,
  like: boolean,
  origin: string = HTTPS_API_ORIGIN
) {
  return fetch(`${origin}/v1/convai/conversations/${conversationId}/feedback`, {
    method: "POST",
    body: JSON.stringify({
      feedback: like ? "like" : "dislike",
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}
