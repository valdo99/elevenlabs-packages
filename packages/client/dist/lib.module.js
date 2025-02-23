function e(){return e=Object.assign?Object.assign.bind():function(e){for(var n=1;n<arguments.length;n++){var t=arguments[n];for(var o in t)({}).hasOwnProperty.call(t,o)&&(e[o]=t[o])}return e},e.apply(null,arguments)}function n(e){for(var n=window.atob(e),t=n.length,o=new Uint8Array(t),r=0;r<t;r++)o[r]=n.charCodeAt(r);return o.buffer}var t=new Blob(['\n      const BIAS = 0x84;\n      const CLIP = 32635;\n      const encodeTable = [\n        0,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3,\n        4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,\n        5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,\n        5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,\n        7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7\n      ];\n      \n      function encodeSample(sample) {\n        let sign;\n        let exponent;\n        let mantissa;\n        let muLawSample;\n        sign = (sample >> 8) & 0x80;\n        if (sign !== 0) sample = -sample;\n        sample = sample + BIAS;\n        if (sample > CLIP) sample = CLIP;\n        exponent = encodeTable[(sample>>7) & 0xFF];\n        mantissa = (sample >> (exponent+3)) & 0x0F;\n        muLawSample = ~(sign | (exponent << 4) | mantissa);\n        \n        return muLawSample;\n      }\n    \n      class RawAudioProcessor extends AudioWorkletProcessor {\n        constructor() {\n          super();\n                    \n          this.port.onmessage = ({ data }) => {\n            this.buffer = []; // Initialize an empty buffer\n            this.bufferSize = data.sampleRate / 4;\n            \n            if (globalThis.LibSampleRate && sampleRate !== data.sampleRate) {\n              globalThis.LibSampleRate.create(1, sampleRate, data.sampleRate).then(resampler => {\n                this.resampler = resampler;\n              });\n            } \n          };\n        }\n        process(inputs) {\n          if (!this.buffer) {\n            return true;\n          }\n          \n          const input = inputs[0]; // Get the first input node\n          if (input.length > 0) {\n            let channelData = input[0]; // Get the first channel\'s data\n\n            // Resample the audio if necessary\n            if (this.resampler) {\n              channelData = this.resampler.full(channelData);\n            }\n\n            // Add channel data to the buffer\n            this.buffer.push(...channelData);\n            // Get max volume \n            let sum = 0.0;\n            for (let i = 0; i < channelData.length; i++) {\n              sum += channelData[i] * channelData[i];\n            }\n            const maxVolume = Math.sqrt(sum / channelData.length);\n            // Check if buffer size has reached or exceeded the threshold\n            if (this.buffer.length >= this.bufferSize) {\n              const float32Array = new Float32Array(this.buffer)\n              let encodedArray = this.format === "ulaw"\n                ? new Uint8Array(float32Array.length)\n                : new Int16Array(float32Array.length);\n\n              // Iterate through the Float32Array and convert each sample to PCM16\n              for (let i = 0; i < float32Array.length; i++) {\n                // Clamp the value to the range [-1, 1]\n                let sample = Math.max(-1, Math.min(1, float32Array[i]));\n\n                // Scale the sample to the range [-32768, 32767]\n                let value = sample < 0 ? sample * 32768 : sample * 32767;\n                if (this.format === "ulaw") {\n                  value = encodeSample(Math.round(value));\n                }\n\n                encodedArray[i] = value;\n              }\n\n              // Send the buffered data to the main script\n              this.port.postMessage([encodedArray, maxVolume]);\n\n              // Clear the buffer after sending\n              this.buffer = [];\n            }\n          }\n          return true; // Continue processing\n        }\n      }\n      registerProcessor("raw-audio-processor", RawAudioProcessor);\n  '],{type:"application/javascript"}),o=URL.createObjectURL(t);function r(){return["iPad Simulator","iPhone Simulator","iPod Simulator","iPad","iPhone","iPod"].includes(navigator.platform)||navigator.userAgent.includes("Mac")&&"ontouchend"in document}var i=/*#__PURE__*/function(){function e(e,n,t,o){this.context=void 0,this.analyser=void 0,this.worklet=void 0,this.inputStream=void 0,this.context=e,this.analyser=n,this.worklet=t,this.inputStream=o}return e.create=function(n){var t=n.sampleRate,i=n.format,a=n.preferHeadphonesForIosDevices;try{var s=null,u=null;return Promise.resolve(function(n,c){try{var l=function(){function n(){function n(){return Promise.resolve(s.audioWorklet.addModule(o)).then(function(){return Promise.resolve(navigator.mediaDevices.getUserMedia({audio:c})).then(function(n){var o=s.createMediaStreamSource(u=n),r=new AudioWorkletNode(s,"raw-audio-processor");return r.port.postMessage({type:"setFormat",format:i,sampleRate:t}),o.connect(a),a.connect(r),Promise.resolve(s.resume()).then(function(){return new e(s,a,r,u)})})})}var r=navigator.mediaDevices.getSupportedConstraints().sampleRate,a=(s=new window.AudioContext(r?{sampleRate:t}:{})).createAnalyser(),l=function(){if(!r)return Promise.resolve(s.audioWorklet.addModule("https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js@2.1.2/dist/libsamplerate.worklet.js")).then(function(){})}();return l&&l.then?l.then(n):n()}var c={sampleRate:{ideal:t},echoCancellation:{ideal:!0},noiseSuppression:{ideal:!0}},l=function(){if(r()&&a)return Promise.resolve(window.navigator.mediaDevices.enumerateDevices()).then(function(e){var n=e.find(function(e){return"audioinput"===e.kind&&["airpod","headphone","earphone"].find(function(n){return e.label.toLowerCase().includes(n)})});n&&(c.deviceId={ideal:n.deviceId})})}();return l&&l.then?l.then(n):n()}()}catch(e){return c(e)}return l&&l.then?l.then(void 0,c):l}(0,function(e){var n,t;throw null==(n=u)||n.getTracks().forEach(function(e){return e.stop()}),null==(t=s)||t.close(),e}))}catch(e){return Promise.reject(e)}},e.prototype.close=function(){try{return this.inputStream.getTracks().forEach(function(e){return e.stop()}),Promise.resolve(this.context.close()).then(function(){})}catch(e){return Promise.reject(e)}},e}(),a=new Blob(['\n      const decodeTable = [0,132,396,924,1980,4092,8316,16764];\n      \n      export function decodeSample(muLawSample) {\n        let sign;\n        let exponent;\n        let mantissa;\n        let sample;\n        muLawSample = ~muLawSample;\n        sign = (muLawSample & 0x80);\n        exponent = (muLawSample >> 4) & 0x07;\n        mantissa = muLawSample & 0x0F;\n        sample = decodeTable[exponent] + (mantissa << (exponent+3));\n        if (sign !== 0) sample = -sample;\n\n        return sample;\n      }\n      \n      class AudioConcatProcessor extends AudioWorkletProcessor {\n        constructor() {\n          super();\n          this.buffers = []; // Initialize an empty buffer\n          this.cursor = 0;\n          this.currentBuffer = null;\n          this.wasInterrupted = false;\n          this.finished = false;\n          \n          this.port.onmessage = ({ data }) => {\n            switch (data.type) {\n              case "setFormat":\n                this.format = data.format;\n                break;\n              case "buffer":\n                this.wasInterrupted = false;\n                this.buffers.push(\n                  this.format === "ulaw"\n                    ? new Uint8Array(data.buffer)\n                    : new Int16Array(data.buffer)\n                );\n                break;\n              case "interrupt":\n                this.wasInterrupted = true;\n                break;\n              case "clearInterrupted":\n                if (this.wasInterrupted) {\n                  this.wasInterrupted = false;\n                  this.buffers = [];\n                  this.currentBuffer = null;\n                }\n            }\n          };\n        }\n        process(_, outputs) {\n          let finished = false;\n          const output = outputs[0][0];\n          for (let i = 0; i < output.length; i++) {\n            if (!this.currentBuffer) {\n              if (this.buffers.length === 0) {\n                finished = true;\n                break;\n              }\n              this.currentBuffer = this.buffers.shift();\n              this.cursor = 0;\n            }\n\n            let value = this.currentBuffer[this.cursor];\n            if (this.format === "ulaw") {\n              value = decodeSample(value);\n            }\n            output[i] = value / 32768;\n            this.cursor++;\n\n            if (this.cursor >= this.currentBuffer.length) {\n              this.currentBuffer = null;\n            }\n          }\n\n          if (this.finished !== finished) {\n            this.finished = finished;\n            this.port.postMessage({ type: "process", finished });\n          }\n\n          return true; // Continue processing\n        }\n      }\n\n      registerProcessor("audio-concat-processor", AudioConcatProcessor);\n    '],{type:"application/javascript"}),s=URL.createObjectURL(a),u=/*#__PURE__*/function(){function e(e,n,t,o){this.context=void 0,this.analyser=void 0,this.gain=void 0,this.worklet=void 0,this.context=e,this.analyser=n,this.gain=t,this.worklet=o}return e.create=function(n){var t=n.sampleRate,o=n.format;try{var r=null;return Promise.resolve(function(n,i){try{var a=(u=(r=new AudioContext({sampleRate:t})).createAnalyser(),(c=r.createGain()).connect(u),u.connect(r.destination),Promise.resolve(r.audioWorklet.addModule(s)).then(function(){var n=new AudioWorkletNode(r,"audio-concat-processor");return n.port.postMessage({type:"setFormat",format:o}),n.connect(c),Promise.resolve(r.resume()).then(function(){return new e(r,u,c,n)})}))}catch(e){return i(e)}var u,c;return a&&a.then?a.then(void 0,i):a}(0,function(e){var n;throw null==(n=r)||n.close(),e}))}catch(e){return Promise.reject(e)}},e.prototype.close=function(){try{return Promise.resolve(this.context.close()).then(function(){})}catch(e){return Promise.reject(e)}},e}();function c(e){return!!e.type}var l=/*#__PURE__*/function(){function e(e,n,t,o){var r=this;this.socket=void 0,this.conversationId=void 0,this.inputFormat=void 0,this.outputFormat=void 0,this.queue=[],this.disconnectionDetails=null,this.onDisconnectCallback=null,this.onMessageCallback=null,this.socket=e,this.conversationId=n,this.inputFormat=t,this.outputFormat=o,this.socket.addEventListener("error",function(e){setTimeout(function(){return r.disconnect({reason:"error",message:"The connection was closed due to a socket error.",context:e})},0)}),this.socket.addEventListener("close",function(e){r.disconnect(1e3===e.code?{reason:"agent",context:e}:{reason:"error",message:e.reason||"The connection was closed by the server.",context:e})}),this.socket.addEventListener("message",function(e){try{var n=JSON.parse(e.data);if(!c(n))return;r.onMessageCallback?r.onMessageCallback(n):r.queue.push(n)}catch(e){}})}e.create=function(n){try{var t=null;return Promise.resolve(function(o,r){try{var i=(s=null!=(a=n.origin)?a:"wss://api.elevenlabs.io",u=n.signedUrl?n.signedUrl:s+"/v1/convai/conversation?agent_id="+n.agentId,l=["convai"],n.authorization&&l.push("bearer."+n.authorization),t=new WebSocket(u,l),Promise.resolve(new Promise(function(e,o){t.addEventListener("open",function(){var e,o,r,i,a,s={type:"conversation_initiation_client_data"};n.overrides&&(s.conversation_config_override={agent:{prompt:null==(o=n.overrides.agent)?void 0:o.prompt,first_message:null==(r=n.overrides.agent)?void 0:r.firstMessage,language:null==(i=n.overrides.agent)?void 0:i.language},tts:{voice_id:null==(a=n.overrides.tts)?void 0:a.voiceId}}),n.customLlmExtraBody&&(s.custom_llm_extra_body=n.customLlmExtraBody),n.dynamicVariables&&(s.dynamic_variables=n.dynamicVariables),null==(e=t)||e.send(JSON.stringify(s))},{once:!0}),t.addEventListener("error",function(e){setTimeout(function(){return o(e)},0)}),t.addEventListener("close",o),t.addEventListener("message",function(n){var t=JSON.parse(n.data);c(t)&&("conversation_initiation_metadata"===t.type?e(t.conversation_initiation_metadata_event):console.warn("First received message is not conversation metadata."))},{once:!0})})).then(function(n){var o=n.conversation_id,r=n.agent_output_audio_format,i=n.user_input_audio_format,a=d(null!=i?i:"pcm_16000"),s=d(r);return new e(t,o,a,s)}))}catch(e){return r(e)}var a,s,u,l;return i&&i.then?i.then(void 0,r):i}(0,function(e){var n;throw null==(n=t)||n.close(),e}))}catch(e){return Promise.reject(e)}};var n=e.prototype;return n.close=function(){this.socket.close()},n.sendMessage=function(e){this.socket.send(JSON.stringify(e))},n.onMessage=function(e){this.onMessageCallback=e,this.queue.forEach(e),this.queue=[]},n.onDisconnect=function(e){this.onDisconnectCallback=e,this.disconnectionDetails&&e(this.disconnectionDetails)},n.disconnect=function(e){var n;this.disconnectionDetails||(this.disconnectionDetails=e,null==(n=this.onDisconnectCallback)||n.call(this,e))},e}();function d(e){var n=e.split("_"),t=n[0],o=n[1];if(!["pcm","ulaw"].includes(t))throw new Error("Invalid format: "+e);var r=parseInt(o);if(isNaN(r))throw new Error("Invalid sample rate: "+o);return{format:t,sampleRate:r}}function h(e,n){try{var t=e()}catch(e){return n(e)}return t&&t.then?t.then(void 0,n):t}var f={clientTools:{}};function p(e,n,t){if(!e.s){if(t instanceof m){if(!t.s)return void(t.o=p.bind(null,e,n));1&n&&(n=t.s),t=t.v}if(t&&t.then)return void t.then(p.bind(null,e,n),p.bind(null,e,2));e.s=n,e.v=t;var o=e.o;o&&o(e)}}var v={onConnect:function(){},onDebug:function(){},onDisconnect:function(){},onError:function(){},onMessage:function(){},onModeChange:function(){},onStatusChange:function(){},onCanSendFeedbackChange:function(){}},m=/*#__PURE__*/function(){function e(){}return e.prototype.then=function(n,t){var o=new e,r=this.s;if(r){var i=1&r?n:t;if(i){try{p(o,1,i(this.v))}catch(e){p(o,2,e)}return o}return this}return this.o=function(e){try{var r=e.v;1&e.s?p(o,1,n?n(r):r):t?p(o,1,t(r)):p(o,2,r)}catch(e){p(o,2,e)}},o},e}(),g=/*#__PURE__*/function(){function t(e,t,o,r){var i=this,a=this,s=this;this.options=void 0,this.connection=void 0,this.input=void 0,this.output=void 0,this.lastInterruptTimestamp=0,this.mode="listening",this.status="connecting",this.inputFrequencyData=void 0,this.outputFrequencyData=void 0,this.volume=1,this.currentEventId=1,this.lastFeedbackEventId=1,this.canSendFeedback=!1,this.endSession=function(){return s.endSessionWithDetails({reason:"user"})},this.endSessionWithDetails=function(e){try{return"connected"!==i.status&&"connecting"!==i.status?Promise.resolve():(i.updateStatus("disconnecting"),i.connection.close(),Promise.resolve(i.input.close()).then(function(){return Promise.resolve(i.output.close()).then(function(){i.updateStatus("disconnected"),i.options.onDisconnect(e)})}))}catch(e){return Promise.reject(e)}},this.updateMode=function(e){e!==s.mode&&(s.mode=e,s.options.onModeChange({mode:e}))},this.updateStatus=function(e){e!==s.status&&(s.status=e,s.options.onStatusChange({status:e}))},this.updateCanSendFeedback=function(){var e=s.currentEventId!==s.lastFeedbackEventId;s.canSendFeedback!==e&&(s.canSendFeedback=e,s.options.onCanSendFeedbackChange({canSendFeedback:e}))},this.onMessage=function(e){try{var n,t=function(e,n){var t,o=-1;e:{for(var r=0;r<n.length;r++){var i=n[r][0];if(i){var a=i();if(a&&a.then)break e;if(a===e){o=r;break}}else o=r}if(-1!==o){do{for(var s=n[o][1];!s;)o++,s=n[o][1];var u=s();if(u&&u.then){t=!0;break e}var c=n[o][2];o++}while(c&&!c());return u}}var l=new m,d=p.bind(null,l,2);return(t?u.then(h):a.then(function t(a){for(;;){if(a===e){o=r;break}if(++r===n.length){if(-1!==o)break;return void p(l,1,u)}if(i=n[r][0]){if((a=i())&&a.then)return void a.then(t).then(void 0,d)}else o=r}do{for(var s=n[o][1];!s;)o++,s=n[o][1];var u=s();if(u&&u.then)return void u.then(h).then(void 0,d);var c=n[o][2];o++}while(c&&!c());p(l,1,u)})).then(void 0,d),l;function h(e){for(;;){var t=n[o][2];if(!t||t())break;o++;for(var r=n[o][1];!r;)o++,r=n[o][1];if((e=r())&&e.then)return void e.then(h).then(void 0,d)}p(l,1,e)}}(e.type,[[function(){return"interruption"},function(){return e.interruption_event&&(a.lastInterruptTimestamp=e.interruption_event.event_id),a.fadeOutAudio(),void(n=1)}],[function(){return"agent_response"},function(){return a.options.onMessage({source:"ai",message:e.agent_response_event.agent_response}),void(n=1)}],[function(){return"user_transcript"},function(){return"..."===e.user_transcription_event.user_transcript&&a.fadeOutAudio(),a.options.onMessage({source:"user",message:e.user_transcription_event.user_transcript}),void(n=1)}],[function(){return"internal_tentative_agent_response"},function(){return a.options.onDebug({type:"tentative_agent_response",response:e.tentative_agent_response_internal_event.tentative_agent_response}),void(n=1)}],[function(){return"client_tool_call"},function(){var t=function(){if(a.options.onUnhandledClientToolCall)return a.options.onUnhandledClientToolCall(e.client_tool_call),void(n=1);a.onError("Client tool with name "+e.client_tool_call.tool_name+" is not defined on client",{clientToolName:e.client_tool_call.tool_name}),a.connection.sendMessage({type:"client_tool_result",tool_call_id:e.client_tool_call.tool_call_id,result:"Client tool with name "+e.client_tool_call.tool_name+" is not defined on client",is_error:!0}),n=1},o=function(){if(a.options.clientTools.hasOwnProperty(e.client_tool_call.tool_name)){var t=function(){n=1},o=h(function(){return Promise.resolve(a.options.clientTools[e.client_tool_call.tool_name](e.client_tool_call.parameters)).then(function(n){a.connection.sendMessage({type:"client_tool_result",tool_call_id:e.client_tool_call.tool_call_id,result:n,is_error:!1})})},function(n){a.onError("Client tool execution failed with following error: "+(null==n?void 0:n.message),{clientToolName:e.client_tool_call.tool_name}),a.connection.sendMessage({type:"client_tool_result",tool_call_id:e.client_tool_call.tool_call_id,result:"Client tool execution failed: "+(null==n?void 0:n.message),is_error:!0})});return o&&o.then?o.then(t):t()}}();return o&&o.then?o.then(t):t()},function(){return n||n}],[function(){return"audio"},function(){return a.lastInterruptTimestamp<=e.audio_event.event_id&&(a.addAudioBase64Chunk(e.audio_event.audio_base_64),a.currentEventId=e.audio_event.event_id,a.updateCanSendFeedback(),a.updateMode("speaking")),void(n=1)}],[function(){return"ping"},function(){return a.connection.sendMessage({type:"pong",event_id:e.ping_event.event_id}),void(n=1)}],[void 0,function(){return a.options.onDebug(e),void(n=1)}]]);return Promise.resolve(t&&t.then?t.then(function(){}):void 0)}catch(e){return Promise.reject(e)}},this.onInputWorkletMessage=function(e){var n,t;"connected"===s.status&&s.connection.sendMessage({user_audio_chunk:(n=e.data[0].buffer,t=new Uint8Array(n),window.btoa(String.fromCharCode.apply(String,t)))})},this.onOutputWorkletMessage=function(e){var n=e.data;"process"===n.type&&s.updateMode(n.finished?"listening":"speaking")},this.addAudioBase64Chunk=function(e){s.output.gain.gain.value=s.volume,s.output.worklet.port.postMessage({type:"clearInterrupted"}),s.output.worklet.port.postMessage({type:"buffer",buffer:n(e)})},this.fadeOutAudio=function(){s.updateMode("listening"),s.output.worklet.port.postMessage({type:"interrupt"}),s.output.gain.gain.exponentialRampToValueAtTime(1e-4,s.output.context.currentTime+2),setTimeout(function(){s.output.gain.gain.value=s.volume,s.output.worklet.port.postMessage({type:"clearInterrupted"})},2e3)},this.onError=function(e,n){console.error(e,n),s.options.onError(e,n)},this.calculateVolume=function(e){if(0===e.length)return 0;for(var n=0,t=0;t<e.length;t++)n+=e[t]/255;return(n/=e.length)<0?0:n>1?1:n},this.getId=function(){return s.connection.conversationId},this.isOpen=function(){return"connected"===s.status},this.setVolume=function(e){s.volume=e.volume},this.getInputByteFrequencyData=function(){return null!=s.inputFrequencyData||(s.inputFrequencyData=new Uint8Array(s.input.analyser.frequencyBinCount)),s.input.analyser.getByteFrequencyData(s.inputFrequencyData),s.inputFrequencyData},this.getOutputByteFrequencyData=function(){return null!=s.outputFrequencyData||(s.outputFrequencyData=new Uint8Array(s.output.analyser.frequencyBinCount)),s.output.analyser.getByteFrequencyData(s.outputFrequencyData),s.outputFrequencyData},this.getInputVolume=function(){return s.calculateVolume(s.getInputByteFrequencyData())},this.getOutputVolume=function(){return s.calculateVolume(s.getOutputByteFrequencyData())},this.sendFeedback=function(e){s.canSendFeedback?(s.connection.sendMessage({type:"feedback",score:e?"like":"dislike",event_id:s.currentEventId}),s.lastFeedbackEventId=s.currentEventId,s.updateCanSendFeedback()):console.warn(0===s.lastFeedbackEventId?"Cannot send feedback: the conversation has not started yet.":"Cannot send feedback: feedback has already been sent for the current response.")},this.options=e,this.connection=t,this.input=o,this.output=r,this.options.onConnect({conversationId:t.conversationId}),this.connection.onDisconnect(this.endSessionWithDetails),this.connection.onMessage(this.onMessage),this.input.worklet.port.onmessage=this.onInputWorkletMessage,this.output.worklet.port.onmessage=this.onOutputWorkletMessage,this.updateStatus("connected")}return t.startSession=function(n){try{var o=e({},f,v,n);o.onStatusChange({status:"connecting"}),o.onCanSendFeedbackChange({canSendFeedback:!1});var a=null,s=null,c=null,d=null;return Promise.resolve(h(function(){return Promise.resolve(navigator.mediaDevices.getUserMedia({audio:!0})).then(function(h){var f;function p(){return Promise.resolve(l.create(n)).then(function(r){return s=r,Promise.resolve(Promise.all([i.create(e({},s.inputFormat,{preferHeadphonesForIosDevices:n.preferHeadphonesForIosDevices})),u.create(s.outputFormat)])).then(function(e){var n;return a=e[0],c=e[1],null==(n=d)||n.getTracks().forEach(function(e){return e.stop()}),d=null,new t(o,s,a,c)})})}d=h;var v,m=null!=(f=n.connectionDelay)?f:{default:0,android:3e3},g=m.default;if(/android/i.test(navigator.userAgent))g=null!=(v=m.android)?v:g;else if(r()){var _;g=null!=(_=m.ios)?_:g}var y=function(){if(g>0)return Promise.resolve(new Promise(function(e){return setTimeout(e,g)})).then(function(){})}();return y&&y.then?y.then(p):p()})},function(e){var n,t,r;return o.onStatusChange({status:"disconnected"}),null==(n=d)||n.getTracks().forEach(function(e){return e.stop()}),null==(t=s)||t.close(),Promise.resolve(null==(r=a)?void 0:r.close()).then(function(){var n;return Promise.resolve(null==(n=c)?void 0:n.close()).then(function(){throw e})})}))}catch(e){return Promise.reject(e)}},t}();function _(e,n,t){return void 0===t&&(t="https://api.elevenlabs.io"),fetch(t+"/v1/convai/conversations/"+e+"/feedback",{method:"POST",body:JSON.stringify({feedback:n?"like":"dislike"}),headers:{"Content-Type":"application/json"}})}export{g as Conversation,_ as postOverallFeedback};
//# sourceMappingURL=lib.module.js.map
