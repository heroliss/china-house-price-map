const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// 执行实际生成页中的首帧和主题控制代码；不复制另一份主题实现。
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = html.indexOf('const themeButton=');
const end = html.indexOf('const minScale=', start);
const startup = html.match(/\napplyTheme\(themePreference\|\|\(themeMedia\.matches\?'dark':'light'\)\);/)[0];
const themeCode = html.slice(start, end) + startup;

function page({ saved = null, dark = false, storageBlocked = false } = {}) {
  const root = { dataset: {} };
  const attributes = {};
  const buttonEvents = {};
  const windowEvents = {};
  const mediaEvents = {};
  const storage = new Map(saved === null ? [] : [['house-price-map-theme', saved]]);
  const writes = [];
  const button = {
    textContent: '',
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (name, listener) => { buttonEvents[name] = listener; },
  };
  const media = {
    matches: dark,
    addEventListener: (name, listener) => { mediaEvents[name] = listener; },
  };
  const context = {
    document: { documentElement: root, getElementById: () => button },
    matchMedia: () => media,
    localStorage: {
      getItem: name => {
        if (storageBlocked) throw new Error('Storage unavailable');
        return storage.get(name) ?? null;
      },
      setItem: (name, value) => {
        if (storageBlocked) throw new Error('Storage unavailable');
        storage.set(name, value);
        writes.push([name, value]);
      },
    },
    window: { addEventListener: (name, listener) => { windowEvents[name] = listener; } },
    scheduleTransform: () => {},
  };
  vm.runInNewContext(bootstrap, context);
  const firstFrame = root.dataset.theme;
  vm.runInNewContext(themeCode, context);
  return {
    root, attributes, button, writes, firstFrame,
    toggle: () => buttonEvents.click(),
    system: dark => { media.matches = dark; mediaEvents.change({ matches: dark }); },
    otherTab: value => {
      if (value === null) storage.clear();
      else storage.set('house-price-map-theme', value);
      windowEvents.storage({ key: value === null ? null : 'house-price-map-theme' });
    },
  };
}

test('首次和系统变化遵循系统主题，不隐式写入偏好', () => {
  const p = page({ dark: true });
  assert.equal(p.firstFrame, 'dark');
  assert.equal(p.root.dataset.theme, 'dark');
  p.system(false);
  assert.equal(p.root.dataset.theme, 'light');
  assert.equal(p.writes.length, 0);
});

test('保存的选择首帧生效，手动选择后不再被系统覆盖', () => {
  const p = page({ saved: 'light', dark: true });
  assert.equal(p.firstFrame, 'light');
  p.toggle();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.deepEqual(p.writes, [['house-price-map-theme', 'dark']]);
  p.system(false);
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.attributes['aria-pressed'], 'true');
  assert.equal(p.attributes['aria-label'], '切换到浅色模式');
});

test('存储读写都被拒绝时仍可切换，并在当前会话保留手选', () => {
  const p = page({ dark: true, storageBlocked: true });
  assert.equal(p.firstFrame, 'dark');
  p.toggle();
  assert.equal(p.root.dataset.theme, 'light');
  p.system(true);
  assert.equal(p.root.dataset.theme, 'light');
  assert.equal(p.writes.length, 0);
});

test('无效保存值回到系统，另一标签页变更和清空保持一致', () => {
  const p = page({ saved: 'invalid', dark: false });
  assert.equal(p.firstFrame, 'light');
  p.otherTab('dark');
  assert.equal(p.root.dataset.theme, 'dark');
  p.system(false);
  assert.equal(p.root.dataset.theme, 'dark');
  p.otherTab(null);
  assert.equal(p.root.dataset.theme, 'light');
  p.system(true);
  assert.equal(p.root.dataset.theme, 'dark');
});
