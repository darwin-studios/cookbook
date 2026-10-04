const vscode = require('vscode');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');

const workerPath = resolve(__dirname, '../../examples/ide-companion.mjs');
const oauthPath = resolve(__dirname, '../../scripts/run-with-oauth.mjs');

function activate(context) {
  const output = vscode.window.createOutputChannel('Darwin agent suggestions');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'darwinIde.showSuggestions';
  status.text = 'Darwin: set task';
  status.tooltip = 'Set a task to discover relevant external agents. No source text is sent.';
  status.show();
  context.subscriptions.push(output, status);

  let task = context.workspaceState.get('darwinIde.task', '');
  if (typeof task !== 'string') task = '';
  let suggestions = [];
  let worker;
  let buffer = '';

  function showSuggestionStatus() {
    const actionable = suggestions.filter((item) => item.eligibleForActAttempt).length;
    status.text = actionable ? `Darwin: ${actionable} eligible` : suggestions.length ? 'Darwin: matches unavailable' : 'Darwin: no match';
  }

  function language() {
    return vscode.window.activeTextEditor?.document.languageId || '';
  }

  function workArea() {
    const name = vscode.window.activeTextEditor?.document.uri.path.split('/').pop()?.toLowerCase() || '';
    if (/\.(test|spec)\.|^test[_-]|^spec[_-]/.test(name)) return 'tests';
    if (/\.(md|mdx|rst)$/.test(name)) return 'documentation';
    if (/config|^package\.json$|\.(json|toml|ya?ml)$/.test(name)) return 'configuration';
    const lang = language();
    if (['html', 'css', 'scss', 'vue', 'svelte', 'javascriptreact', 'typescriptreact'].includes(lang)) return 'frontend';
    if (['python', 'go', 'rust', 'java', 'ruby', 'php'].includes(lang)) return 'backend';
    return 'implementation';
  }

  function startWorker() {
    if (worker && !worker.killed) return;
    const searchEnv = { ...process.env };
    delete searchEnv.DARWIN_ACCESS_TOKEN; // The background worker can only Search.
    const current = spawn('node', [workerPath, '--stream'], { stdio: ['pipe', 'pipe', 'pipe'], env: searchEnv });
    worker = current;
    current.stdout.setEncoding('utf8');
    current.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 100_000) { buffer = ''; output.appendLine('Worker response exceeded its buffer.'); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'suggestions') {
            if (event.task !== task || (event.language || '') !== language() || (event.workArea || '') !== workArea()) continue;
            suggestions = event.suggestions || [];
            showSuggestionStatus();
            output.appendLine(`\nTask: ${event.task} — ${event.outcome}`);
            if (event.message) output.appendLine(event.message);
            for (const item of suggestions) {
              output.appendLine(`${item.rank}. ${item.agent.name} / ${item.capability.name} [${item.readiness}]`);
              output.appendLine(`   Matched task terms: ${item.matchedTaskTerms.join(', ')}`);
              output.appendLine(`   ${item.capability.description}`);
              if (item.unavailableReason) output.appendLine(`   Route: ${item.unavailableReason}`);
            }
          } else if (event.type === 'unchanged') {
            showSuggestionStatus();
          } else if (event.type === 'error') {
            output.appendLine(`Search error: ${event.message}`);
            status.text = 'Darwin: check output';
          }
        } catch { output.appendLine('Could not read a worker response.'); }
      }
    });
    current.stderr.setEncoding('utf8');
    current.stderr.on('data', (chunk) => output.appendLine(`Worker: ${chunk.trim()}`));
    current.on('error', (error) => {
      status.text = 'Darwin: Node unavailable';
      output.appendLine(`Could not start Node.js 20+: ${error.message}`);
    });
    current.on('exit', () => {
      if (worker === current) { worker = undefined; status.text = 'Darwin: worker stopped'; }
    });
    context.subscriptions.push({ dispose: () => worker?.kill() });
  }

  function sendContext() {
    if (!task || task.trim().length < 8) return;
    startWorker();
    if (!worker?.stdin?.writable) return;
    // Only the explicit task, editor language, and coarse work area leave the IDE.
    worker.stdin.write(`${JSON.stringify({ task, language: language(), workArea: workArea() })}\n`);
    status.text = 'Darwin: searching';
  }

  context.subscriptions.push(vscode.commands.registerCommand('darwinIde.setTask', async () => {
    const next = await vscode.window.showInputBox({
      title: 'What are you building or debugging?',
      prompt: 'A short task summary. Do not include source code, secrets, or customer data.',
      value: task,
      validateInput: (value) => value && value.trim().length < 8 ? 'Use at least 8 characters.' : undefined,
    });
    if (next === undefined) return;
    task = next.trim();
    await context.workspaceState.update('darwinIde.task', task);
    suggestions = [];
    if (task) sendContext();
    else status.text = 'Darwin: set task';
  }));

  context.subscriptions.push(vscode.commands.registerCommand('darwinIde.searchNow', sendContext));
  context.subscriptions.push(vscode.commands.registerCommand('darwinIde.showSuggestions', async () => {
    if (!task) { await vscode.commands.executeCommand('darwinIde.setTask'); return; }
    if (!suggestions.length) { output.show(true); return; }
    const picked = await vscode.window.showQuickPick(suggestions.map((item) => ({
      label: `${item.agent.name} / ${item.capability.name}`,
      description: item.readiness,
      detail: item.capability.description,
      item,
    })), { title: 'Darwin suggestions for your current task', placeHolder: 'Review a capability before starting any work' });
    if (!picked) return;
    if (!picked.item.eligibleForActAttempt) {
      vscode.window.showWarningMessage(`This route cannot start work now: ${picked.item.unavailableReason || picked.item.readiness}. Choose another result.`);
      return;
    }
    const answer = await vscode.window.showInformationMessage(
      `Try ${picked.item.agent.name} / ${picked.item.capability.name}? Darwin will re-search, ask for OAuth, and require you to choose and confirm the exact request.`,
      { modal: true }, 'Open reviewed Act flow',
    );
    if (answer !== 'Open reviewed Act flow') return;
    const execution = new vscode.ProcessExecution('node', [oauthPath, 'ide-companion'], {
      env: { DARWIN_IDE_TASK: task, DARWIN_IDE_LANGUAGE: language(), DARWIN_IDE_WORK_AREA: workArea() },
    });
    const scope = vscode.workspace.workspaceFolders?.[0];
    if (!scope) {
      vscode.window.showWarningMessage('Open a workspace folder before starting the reviewed Act flow.');
      return;
    }
    const actTask = new vscode.Task({ type: 'darwin-ide-act' }, scope, 'Darwin reviewed Act', 'Darwin', execution, []);
    actTask.presentationOptions = { reveal: vscode.TaskRevealKind.Always, focus: true };
    await vscode.tasks.executeTask(actTask);
  }));

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(sendContext));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(sendContext));
  if (task) sendContext();
}

function deactivate() {}

module.exports = { activate, deactivate };
