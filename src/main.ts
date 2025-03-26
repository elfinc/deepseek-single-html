
(window as any)._DSHTML_ = document.documentElement.outerHTML;

import logoBase64 from '@/assets/favicon.png';
document.addEventListener('DOMContentLoaded', () => {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = logoBase64;
  document.head.appendChild(link);
});

import '@/assets/main.css';
import 'element-plus/dist/index.css';

import { createApp } from 'vue';
import App from './App.vue';
const app = createApp(App);

import VMdEditor from '@kangc/v-md-editor';
import '@kangc/v-md-editor/lib/style/base-editor.css';
import githubTheme from '@kangc/v-md-editor/lib/theme/github.js';
import '@kangc/v-md-editor/lib/theme/style/github.css';
import hljs from 'highlight.js';
VMdEditor.use(githubTheme, {
  Hljs: hljs,
  codeHighlightExtensionMap: {
    vue: 'xml',
  },
});
import createKatexPlugin from '@kangc/v-md-editor/lib/plugins/katex/npm';
import createCopyCodePlugin from '@kangc/v-md-editor/lib/plugins/copy-code/index';
import 'katex/dist/katex.min.css';
import '@kangc/v-md-editor/lib/plugins/copy-code/copy-code.css';
VMdEditor.use(createKatexPlugin());
VMdEditor.use(createCopyCodePlugin());
app.use(VMdEditor);

app.mount('#app');
