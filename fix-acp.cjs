const fs = require('fs');
const path = '/Users/alaingaldemas/Documents/agentic/claude-scionos/src/acp-server.js';
let content = fs.readFileSync(path, 'utf8');

// Add debug log at the very start of handleRequest function
const oldHandleRequest = `  async function handleRequest(request) {
    activeRequests += 1;
    try {
      const { id = null, method, params = {} } = request ?? {};

      if (!method || typeof method !== 'string') {`;

const newHandleRequest = `  async function handleRequest(request) {
    activeRequests += 1;
    try {
      const { id = null, method, params = {} } = request ?? {};

      logEvent('[DEBUG] handleRequest START method=' + JSON.stringify(method) + ' type=' + typeof method + ' id=' + id);

      if (!method || typeof method !== 'string') {
        logEvent('[DEBUG] Method rejected: method=' + method + ' typeof=' + typeof method);`;

content = content.replace(oldHandleRequest, newHandleRequest);

// Add debug log before switch statement
const oldBeforeSwitch = `      switch (method) {`;

const newBeforeSwitch = `      logEvent('[DEBUG] About to switch on method=' + method);
      switch (method) {`;

content = content.replace(oldBeforeSwitch, newBeforeSwitch);

// Add debug log in default case
const oldDefault = `        default:
          if (id !== null) {`;

const newDefault = `        default:
          logEvent('[DEBUG] DEFAULT CASE HIT method=' + JSON.stringify(method) + ' length=' + (method ? method.length : 'null'));
          if (id !== null) {`;

content = content.replace(oldDefault, newDefault);

fs.writeFileSync(path, content, 'utf8');
console.log('File updated successfully - debug logs added with logEvent');