function e(){return e=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var a in n)({}).hasOwnProperty.call(n,a)&&(e[a]=n[a])}return e},e.apply(null,arguments)}function t(e){const t=new Uint8Array(e);return window.btoa(String.fromCharCode(...t))}function n(e){const t=window.atob(e),n=t.length,a=new Uint8Array(n);for(let e=0;e<n;e++)a[e]=t.charCodeAt(e);return a.buffer}const a=new Blob(['\n      const BIAS = 0x84;\n      const CLIP = 32635;\n      const encodeTable = [\n        0,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3,\n        4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,\n        5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,\n        5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7\n      ];\n      \n      function encodeSample(sample) {\n        let sign;\n        let exponent;\n        let mantissa;\n        let muLawSample;\n        sign = (sample >> 8) & 0x80;\n        if (sign !== 0) sample = -sample;\n        sample = sample + BIAS;\n        if (sample > CLIP) sample = CLIP;\n        exponent = encodeTable[(sample>>7) & 0xFF];\n        mantissa = (sample >> (exponent+3)) & 0x0F;\n        muLawSample = ~(sign | (exponent << 4) | mantissa);\n        \n        return muLawSample;\n      }\n    \n      class RawAudioProcessor extends AudioWorkletProcessor {\n        constructor() {\n          super();\n                    \n          this.port.onmessage = ({ data }) => {\n            this.buffer = []; // Initialize an empty buffer\n            this.bufferSize = data.sampleRate / 4;\n            \n            if (globalThis.LibSampleRate && sampleRate !== data.sampleRate) {\n              globalThis.LibSampleRate.create(1, sampleRate, data.sampleRate).then(resampler => {\n                this.resampler = resampler;\n              });\n            } \n          };\n        }\n        process(inputs) {\n          if (!this.buffer) {\n            return true;\n          }\n          \n          const input = inputs[0]; // Get the first input node\n          if (input.length > 0) {\n            let channelData = input[0]; // Get the first channel\'s data\n\n            // Resample the audio if necessary\n            if (this.resampler) {\n              channelData = this.resampler.full(channelData);\n            }\n\n            // Add channel data to the buffer\n            this.buffer.push(...channelData);\n            // Get max volume \n            let sum = 0.0;\n            for (let i = 0; i < channelData.length; i++) {\n              sum += channelData[i] * channelData[i];\n            }\n            const maxVolume = Math.sqrt(sum / channelData.length);\n            // Check if buffer size has reached or exceeded the threshold\n            if (this.buffer.length >= this.bufferSize) {\n              const float32Array = new Float32Array(this.buffer)\n              let encodedArray = this.format === "ulaw"\n                ? new Uint8Array(float32Array.length)\n                : new Int16Array(float32Array.length);\n\n              // Iterate through the Float32Array and convert each sample to PCM16\n              for (let i = 0; i < float32Array.length; i++) {\n                // Clamp the value to the range [-1, 1]\n                let sample = Math.max(-1, Math.min(1, float32Array[i]));\n\n                // Scale the sample to the range [-32768, 32767]\n                let value = sample < 0 ? sample * 32768 : sample * 32767;\n                if (this.format === "ulaw") {\n                  value = encodeSample(Math.round(value));\n                }\n\n                encodedArray[i] = value;\n              }\n\n              // Send the buffered data to the main script\n              this.port.postMessage([encodedArray, maxVolume]);\n\n              // Clear the buffer after sending\n              this.buffer = [];\n            }\n          }\n          return true; // Continue processing\n        }\n      }\n      registerProcessor("raw-audio-processor", RawAudioProcessor);\n  '],{type:"application/javascript"}),s=URL.createObjectURL(a);function o(){return["iPad Simulator","iPhone Simulator","iPod Simulator","iPad","iPhone","iPod"].includes(navigator.platform)||navigator.userAgent.includes("Mac")&&"ontouchend"in document}class i{static async create({sampleRate:e,format:t,preferHeadphonesForIosDevices:n}){let a=null,r=null;try{const l={sampleRate:{ideal:e},echoCancellation:{ideal:!0},noiseSuppression:{ideal:!0}};if(o()&&n){const e=(await window.navigator.mediaDevices.enumerateDevices()).find(e=>"audioinput"===e.kind&&["airpod","headphone","earphone"].find(t=>e.label.toLowerCase().includes(t)));e&&(l.deviceId={ideal:e.deviceId})}const c=navigator.mediaDevices.getSupportedConstraints().sampleRate;a=new window.AudioContext(c?{sampleRate:e}:{});const u=a.createAnalyser();c||await a.audioWorklet.addModule("https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js@2.1.2/dist/libsamplerate.worklet.js"),await a.audioWorklet.addModule(s),r=await navigator.mediaDevices.getUserMedia({audio:l});const d=a.createMediaStreamSource(r),h=new AudioWorkletNode(a,"raw-audio-processor");return h.port.postMessage({type:"setFormat",format:t,sampleRate:e}),d.connect(u),u.connect(h),await a.resume(),new i(a,u,h,r)}catch(e){var l,c;throw null==(l=r)||l.getTracks().forEach(e=>e.stop()),null==(c=a)||c.close(),e}}constructor(e,t,n,a){this.context=void 0,this.analyser=void 0,this.worklet=void 0,this.inputStream=void 0,this.context=e,this.analyser=t,this.worklet=n,this.inputStream=a}async close(){this.inputStream.getTracks().forEach(e=>e.stop()),await this.context.close()}}const r=new Blob(['\n      const decodeTable = [0,132,396,924,1980,4092,8316,16764];\n      \n      export function decodeSample(muLawSample) {\n        let sign;\n        let exponent;\n        let mantissa;\n        let sample;\n        muLawSample = ~muLawSample;\n        sign = (muLawSample & 0x80);\n        exponent = (muLawSample >> 4) & 0x07;\n        mantissa = muLawSample & 0x0F;\n        sample = decodeTable[exponent] + (mantissa << (exponent+3));\n        if (sign !== 0) sample = -sample;\n\n        return sample;\n      }\n      \n      class AudioConcatProcessor extends AudioWorkletProcessor {\n        constructor() {\n          super();\n          this.buffers = []; // Initialize an empty buffer\n          this.cursor = 0;\n          this.currentBuffer = null;\n          this.wasInterrupted = false;\n          this.finished = false;\n          \n          this.port.onmessage = ({ data }) => {\n            switch (data.type) {\n              case "setFormat":\n                this.format = data.format;\n                break;\n              case "buffer":\n                this.wasInterrupted = false;\n                this.buffers.push(\n                  this.format === "ulaw"\n                    ? new Uint8Array(data.buffer)\n                    : new Int16Array(data.buffer)\n                );\n                break;\n              case "interrupt":\n                this.wasInterrupted = true;\n                break;\n              case "clearInterrupted":\n                if (this.wasInterrupted) {\n                  this.wasInterrupted = false;\n                  this.buffers = [];\n                  this.currentBuffer = null;\n                }\n            }\n          };\n        }\n        process(_, outputs) {\n          let finished = false;\n          const output = outputs[0][0];\n          for (let i = 0; i < output.length; i++) {\n            if (!this.currentBuffer) {\n              if (this.buffers.length === 0) {\n                finished = true;\n                break;\n              }\n              this.currentBuffer = this.buffers.shift();\n              this.cursor = 0;\n            }\n\n            let value = this.currentBuffer[this.cursor];\n            if (this.format === "ulaw") {\n              value = decodeSample(value);\n            }\n            output[i] = value / 32768;\n            this.cursor++;\n\n            if (this.cursor >= this.currentBuffer.length) {\n              this.currentBuffer = null;\n            }\n          }\n\n          if (this.finished !== finished) {\n            this.finished = finished;\n            this.port.postMessage({ type: "process", finished });\n          }\n\n          return true; // Continue processing\n        }\n      }\n\n      registerProcessor("audio-concat-processor", AudioConcatProcessor);\n    '],{type:"application/javascript"}),l=URL.createObjectURL(r);class c{static async create({sampleRate:e,format:t}){let n=null;try{n=new AudioContext({sampleRate:e});const a=n.createAnalyser(),s=n.createGain();s.connect(a),a.connect(n.destination),await n.audioWorklet.addModule(l);const o=new AudioWorkletNode(n,"audio-concat-processor");return o.port.postMessage({type:"setFormat",format:t}),o.connect(s),await n.resume(),new c(n,a,s,o)}catch(e){var a;throw null==(a=n)||a.close(),e}}constructor(e,t,n,a){this.context=void 0,this.analyser=void 0,this.gain=void 0,this.worklet=void 0,this.context=e,this.analyser=t,this.gain=n,this.worklet=a}async close(){await this.context.close()}}function u(e){return!!e.type}class d{static async create(e){let t=null;try{var n;const a=null!=(n=e.origin)?n:"wss://api.elevenlabs.io",s=e.signedUrl?e.signedUrl:a+"/v1/convai/conversation?agent_id="+e.agentId,o=["convai"];e.authorization&&o.push(`bearer.${e.authorization}`),t=new WebSocket(s,o);const i=await new Promise((n,a)=>{t.addEventListener("open",()=>{var n;const a={type:"conversation_initiation_client_data"};var s,o,i,r;e.overrides&&(a.conversation_config_override={agent:{prompt:null==(s=e.overrides.agent)?void 0:s.prompt,first_message:null==(o=e.overrides.agent)?void 0:o.firstMessage,language:null==(i=e.overrides.agent)?void 0:i.language},tts:{voice_id:null==(r=e.overrides.tts)?void 0:r.voiceId}}),e.customLlmExtraBody&&(a.custom_llm_extra_body=e.customLlmExtraBody),e.dynamicVariables&&(a.dynamic_variables=e.dynamicVariables),null==(n=t)||n.send(JSON.stringify(a))},{once:!0}),t.addEventListener("error",e=>{setTimeout(()=>a(e),0)}),t.addEventListener("close",a),t.addEventListener("message",e=>{const t=JSON.parse(e.data);u(t)&&("conversation_initiation_metadata"===t.type?n(t.conversation_initiation_metadata_event):console.warn("First received message is not conversation metadata."))},{once:!0})}),{conversation_id:r,agent_output_audio_format:l,user_input_audio_format:c}=i,p=h(null!=c?c:"pcm_16000"),m=h(l);return new d(t,r,p,m)}catch(e){var a;throw null==(a=t)||a.close(),e}}constructor(e,t,n,a){this.socket=void 0,this.conversationId=void 0,this.inputFormat=void 0,this.outputFormat=void 0,this.queue=[],this.disconnectionDetails=null,this.onDisconnectCallback=null,this.onMessageCallback=null,this.socket=e,this.conversationId=t,this.inputFormat=n,this.outputFormat=a,this.socket.addEventListener("error",e=>{setTimeout(()=>this.disconnect({reason:"error",message:"The connection was closed due to a socket error.",context:e}),0)}),this.socket.addEventListener("close",e=>{this.disconnect(1e3===e.code?{reason:"agent",context:e}:{reason:"error",message:e.reason||"The connection was closed by the server.",context:e})}),this.socket.addEventListener("message",e=>{try{const t=JSON.parse(e.data);if(!u(t))return;this.onMessageCallback?this.onMessageCallback(t):this.queue.push(t)}catch(e){}})}close(){this.socket.close()}sendMessage(e){this.socket.send(JSON.stringify(e))}onMessage(e){this.onMessageCallback=e,this.queue.forEach(e),this.queue=[]}onDisconnect(e){this.onDisconnectCallback=e,this.disconnectionDetails&&e(this.disconnectionDetails)}disconnect(e){var t;this.disconnectionDetails||(this.disconnectionDetails=e,null==(t=this.onDisconnectCallback)||t.call(this,e))}}function h(e){const[t,n]=e.split("_");if(!["pcm","ulaw"].includes(t))throw new Error(`Invalid format: ${e}`);const a=parseInt(n);if(isNaN(a))throw new Error(`Invalid sample rate: ${n}`);return{format:t,sampleRate:a}}const p={clientTools:{}},m={onConnect:()=>{},onDebug:()=>{},onDisconnect:()=>{},onError:()=>{},onMessage:()=>{},onModeChange:()=>{},onStatusChange:()=>{},onCanSendFeedbackChange:()=>{}};class f{static async startSession(t){const n=e({},p,m,t);n.onStatusChange({status:"connecting"}),n.onCanSendFeedbackChange({canSendFeedback:!1});let a=null,s=null,r=null,l=null;try{var u,h;l=await navigator.mediaDevices.getUserMedia({audio:!0});const p=null!=(u=t.connectionDelay)?u:{default:0,android:3e3};let m=p.default;var g;if(/android/i.test(navigator.userAgent))m=null!=(g=p.android)?g:m;else if(o()){var v;m=null!=(v=p.ios)?v:m}return m>0&&await new Promise(e=>setTimeout(e,m)),s=await d.create(t),[a,r]=await Promise.all([i.create(e({},s.inputFormat,{preferHeadphonesForIosDevices:t.preferHeadphonesForIosDevices})),c.create(s.outputFormat)]),null==(h=l)||h.getTracks().forEach(e=>e.stop()),l=null,new f(n,s,a,r)}catch(e){var _,y,w,b;throw n.onStatusChange({status:"disconnected"}),null==(_=l)||_.getTracks().forEach(e=>e.stop()),null==(y=s)||y.close(),await(null==(w=a)?void 0:w.close()),await(null==(b=r)?void 0:b.close()),e}}constructor(e,a,s,o){var i=this;this.options=void 0,this.connection=void 0,this.input=void 0,this.output=void 0,this.lastInterruptTimestamp=0,this.mode="listening",this.status="connecting",this.inputFrequencyData=void 0,this.outputFrequencyData=void 0,this.volume=1,this.currentEventId=1,this.lastFeedbackEventId=1,this.canSendFeedback=!1,this.endSession=()=>this.endSessionWithDetails({reason:"user"}),this.endSessionWithDetails=async function(e){"connected"!==i.status&&"connecting"!==i.status||(i.updateStatus("disconnecting"),i.connection.close(),await i.input.close(),await i.output.close(),i.updateStatus("disconnected"),i.options.onDisconnect(e))},this.updateMode=e=>{e!==this.mode&&(this.mode=e,this.options.onModeChange({mode:e}))},this.updateStatus=e=>{e!==this.status&&(this.status=e,this.options.onStatusChange({status:e}))},this.updateCanSendFeedback=()=>{const e=this.currentEventId!==this.lastFeedbackEventId;this.canSendFeedback!==e&&(this.canSendFeedback=e,this.options.onCanSendFeedbackChange({canSendFeedback:e}))},this.onMessage=async function(e){switch(e.type){case"interruption":e.interruption_event&&(i.lastInterruptTimestamp=e.interruption_event.event_id),i.fadeOutAudio();break;case"agent_response":i.options.onMessage({source:"ai",message:e.agent_response_event.agent_response});break;case"user_transcript":"..."===e.user_transcription_event.user_transcript&&i.fadeOutAudio(),i.options.onMessage({source:"user",message:e.user_transcription_event.user_transcript});break;case"internal_tentative_agent_response":i.options.onDebug({type:"tentative_agent_response",response:e.tentative_agent_response_internal_event.tentative_agent_response});break;case"client_tool_call":if(i.options.clientTools.hasOwnProperty(e.client_tool_call.tool_name)){try{var t;const n=null!=(t=await i.options.clientTools[e.client_tool_call.tool_name](e.client_tool_call.parameters))?t:"Client tool execution successful.";i.connection.sendMessage({type:"client_tool_result",tool_call_id:e.client_tool_call.tool_call_id,result:n,is_error:!1})}catch(t){i.onError("Client tool execution failed with following error: "+(null==t?void 0:t.message),{clientToolName:e.client_tool_call.tool_name}),i.connection.sendMessage({type:"client_tool_result",tool_call_id:e.client_tool_call.tool_call_id,result:"Client tool execution failed: "+(null==t?void 0:t.message),is_error:!0})}break}if(i.options.onUnhandledClientToolCall){i.options.onUnhandledClientToolCall(e.client_tool_call);break}i.onError(`Client tool with name ${e.client_tool_call.tool_name} is not defined on client`,{clientToolName:e.client_tool_call.tool_name}),i.connection.sendMessage({type:"client_tool_result",tool_call_id:e.client_tool_call.tool_call_id,result:`Client tool with name ${e.client_tool_call.tool_name} is not defined on client`,is_error:!0});break;case"audio":i.lastInterruptTimestamp<=e.audio_event.event_id&&(i.addAudioBase64Chunk(e.audio_event.audio_base_64),i.currentEventId=e.audio_event.event_id,i.updateCanSendFeedback(),i.updateMode("speaking"));break;case"ping":i.connection.sendMessage({type:"pong",event_id:e.ping_event.event_id});break;default:i.options.onDebug(e)}},this.onInputWorkletMessage=e=>{"connected"===this.status&&this.connection.sendMessage({user_audio_chunk:t(e.data[0].buffer)})},this.onOutputWorkletMessage=({data:e})=>{"process"===e.type&&this.updateMode(e.finished?"listening":"speaking")},this.addAudioBase64Chunk=e=>{this.output.gain.gain.value=this.volume,this.output.worklet.port.postMessage({type:"clearInterrupted"}),this.output.worklet.port.postMessage({type:"buffer",buffer:n(e)})},this.fadeOutAudio=()=>{this.updateMode("listening"),this.output.worklet.port.postMessage({type:"interrupt"}),this.output.gain.gain.exponentialRampToValueAtTime(1e-4,this.output.context.currentTime+2),setTimeout(()=>{this.output.gain.gain.value=this.volume,this.output.worklet.port.postMessage({type:"clearInterrupted"})},2e3)},this.onError=(e,t)=>{console.error(e,t),this.options.onError(e,t)},this.calculateVolume=e=>{if(0===e.length)return 0;let t=0;for(let n=0;n<e.length;n++)t+=e[n]/255;return t/=e.length,t<0?0:t>1?1:t},this.getId=()=>this.connection.conversationId,this.isOpen=()=>"connected"===this.status,this.setVolume=({volume:e})=>{this.volume=e},this.getInputByteFrequencyData=()=>(null!=this.inputFrequencyData||(this.inputFrequencyData=new Uint8Array(this.input.analyser.frequencyBinCount)),this.input.analyser.getByteFrequencyData(this.inputFrequencyData),this.inputFrequencyData),this.getOutputByteFrequencyData=()=>(null!=this.outputFrequencyData||(this.outputFrequencyData=new Uint8Array(this.output.analyser.frequencyBinCount)),this.output.analyser.getByteFrequencyData(this.outputFrequencyData),this.outputFrequencyData),this.getInputVolume=()=>this.calculateVolume(this.getInputByteFrequencyData()),this.getOutputVolume=()=>this.calculateVolume(this.getOutputByteFrequencyData()),this.sendFeedback=e=>{this.canSendFeedback?(this.connection.sendMessage({type:"feedback",score:e?"like":"dislike",event_id:this.currentEventId}),this.lastFeedbackEventId=this.currentEventId,this.updateCanSendFeedback()):console.warn(0===this.lastFeedbackEventId?"Cannot send feedback: the conversation has not started yet.":"Cannot send feedback: feedback has already been sent for the current response.")},this.options=e,this.connection=a,this.input=s,this.output=o,this.options.onConnect({conversationId:a.conversationId}),this.connection.onDisconnect(this.endSessionWithDetails),this.connection.onMessage(this.onMessage),this.input.worklet.port.onmessage=this.onInputWorkletMessage,this.output.worklet.port.onmessage=this.onOutputWorkletMessage,this.updateStatus("connected")}}function g(e,t,n="https://api.elevenlabs.io"){return fetch(`${n}/v1/convai/conversations/${e}/feedback`,{method:"POST",body:JSON.stringify({feedback:t?"like":"dislike"}),headers:{"Content-Type":"application/json"}})}export{f as Conversation,g as postOverallFeedback};
//# sourceMappingURL=lib.modern.js.map
