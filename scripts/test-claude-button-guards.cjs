const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
const context = vm.createContext({ document: { body: {} } });
for (const name of ['_claudeInCodeBlock', '_claudeInUserTurn']) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start, `Missing ${name}`);
  vm.runInContext(source.slice(start, end), context);
}

function element(parentElement, attrs = [], classes = [], tagName = 'DIV') {
  return {
    parentElement, tagName, classList: classes,
    hasAttribute(name) { return attrs.includes(name); },
    closest() {
      for (let el = this; el; el = el.parentElement) {
        if (el.hasAttribute('data-user-scope') || el.hasAttribute('data-reply-scope')) return el;
      }
      return null;
    }
  };
}

const chat = element(null, [], ['code-blocks-follow-text-size', '[&_.code-block]:mt-2']);
const reply = element(chat, ['data-reply-scope']);
const aiCopy = element(element(reply));
assert.equal(context._claudeInCodeBlock(aiCopy), false, 'Chat styling must not hide AI controls');
assert.equal(context._claudeInUserTurn(aiCopy), false, 'AI controls must pass the user guard');

const user = element(chat, ['data-user-scope']);
assert.equal(context._claudeInUserTurn(element(user)), true, 'User controls must be excluded');
const nestedReply = element(user, ['data-reply-scope']);
assert.equal(context._claudeInUserTurn(element(nestedReply)), false, 'Nearest reply scope wins');

for (const block of [
  element(reply, [], [], 'PRE'),
  element(reply, ['data-code-block']),
  element(reply, [], ['code-block']),
  element(reply, [], ['CodeBlock']),
  element(reply, [], ['code-block-header'])
]) {
  assert.equal(context._claudeInCodeBlock(element(block)), true, 'Real code controls must be excluded');
}

// No message scope at all (older layout): the transcript's settings class must still not match.
assert.equal(context._claudeInCodeBlock(element(element(chat))), false, 'Settings class is not a code block');

console.log('PASS: AI controls, user controls, nested scopes, and five code-block layouts');
