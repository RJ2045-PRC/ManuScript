import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/i18n/zh-cn'
import purifier from 'dompurify'
window.ManuScriptWritingEditor=Editor
window.manuscriptSanitize=(html)=>purifier.sanitize(html,{ADD_TAGS:['span'],FORBID_TAGS:['iframe','style','form','object','embed','svg','math'],FORBID_ATTR:['style','srcset'],ALLOW_DATA_ATTR:true})
