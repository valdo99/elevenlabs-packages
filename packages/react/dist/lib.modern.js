import{useRef as e,useState as n,useEffect as t}from"react";import{Conversation as r}from"elevenlabs-fork-valdo-client";export{postOverallFeedback}from"elevenlabs-fork-valdo-client";function u(){return u=Object.assign?Object.assign.bind():function(e){for(var n=1;n<arguments.length;n++){var t=arguments[n];for(var r in t)({}).hasOwnProperty.call(t,r)&&(e[r]=t[r])}return e},u.apply(null,arguments)}function l(l){const a=e(null),c=e(null),[o,s]=n("disconnected"),[i,d]=n(!1),[v,g]=n("listening");return t(()=>()=>{var e;null==(e=a.current)||e.endSession()},[]),{startSession:async e=>{var n;if(null!=(n=a.current)&&n.isOpen())return a.current.getId();if(c.current)return(await c.current).getId();try{return c.current=r.startSession(u({},null!=l?l:{},null!=e?e:{},{onModeChange:({mode:e})=>{g(e)},onStatusChange:({status:e})=>{s(e)},onCanSendFeedbackChange:({canSendFeedback:e})=>{d(e)}})),a.current=await c.current,a.current.getId()}finally{c.current=null}},endSession:async()=>{const e=a.current;a.current=null,await(null==e?void 0:e.endSession())},setVolume:({volume:e})=>{var n;null==(n=a.current)||n.setVolume({volume:e})},getInputByteFrequencyData:()=>{var e;return null==(e=a.current)?void 0:e.getInputByteFrequencyData()},getOutputByteFrequencyData:()=>{var e;return null==(e=a.current)?void 0:e.getOutputByteFrequencyData()},getInputVolume:()=>{var e,n;return null!=(e=null==(n=a.current)?void 0:n.getInputVolume())?e:0},getOutputVolume:()=>{var e,n;return null!=(e=null==(n=a.current)?void 0:n.getOutputVolume())?e:0},sendFeedback:e=>{var n;null==(n=a.current)||n.sendFeedback(e)},status:o,canSendFeedback:i,isSpeaking:"speaking"===v}}export{l as useConversation};
//# sourceMappingURL=lib.modern.js.map
