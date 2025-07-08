/*
Prefix: dp-
File Names: doxy-plus.*
*/

// doxy-plus.js
// @ts-nocheck
/* global store, DOC_ROOT */

; (function ($) {
  'use strict';

  // #region 🟩 CONSTANTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Storage Keys
  const KEY__DUAL_NAV = 'dual_nav'; // key by which dual nav enabled state is stored
  const KEY__PRI_WIDTH = 'pri_width'; // key by which width of the dual nav -> primary pane is stored
  const KEY__SEC_WIDTH = 'sec_width'; // key by which width of the dual nav -> secondary pane is stored
  const KEY__GEN_DATA = 'gen_data'; // key by which the doxygen generation time is stored
  const KEY__PRI_TREE = 'pri_tree'; // key by which primary tree for dual nav is stored
  const KEY__PRI_NAV_EXPANDED_NODES = 'pri_nav_expanded_nodes'; // key by which primary nav's already expanded nodes are stored

  // Constant Values
  const ICON_SIDE_NAV = 'doxy-plus-side-nav.png'; // name for the icon that shows the side nav symbol
  const ICON_DUAL_NAV = 'doxy-plus-dual-nav.png'; // name for the icon that shows the dual nav symbol
  const MIN_W = 25; // minimum width of either primary or secondary nav panes in dual nav configuration
  const GUTTER_W = 100; // right side gutter width in dual nav configuration
  const MEDIA_QUERY_WIN_WIDTH = window.matchMedia('(min-width: 768px)'); // a MediaQueryList for “min-width: 768px”, later used to set the correct layout
  const TIME_TO_LIVE = 10 * 60 * 1000; // 10 minutes, time for a storage variable to be considered stale. 7 * 24 * 60 * 60 * 1000 == 7 Days, 30 * 24 * 60 * 60 * 1000 == 30 Days
  const IS_HTML_END = /\.(?:xhtml|html)$/i; // case-insensitive check for a string ending in either .xhtml or .html
  const TIMEOUT = 2000;

  console.log('window.DOXY_PLUS_DATE_TIME', window.DOXY_PLUS_DATE_TIME);
  const DOXY_TIME = (() => {
    let footerEl = document.querySelector('#nav-path li.footer') || document.querySelector('address.footer small');
    if (footerEl) {
      const text = footerEl.textContent || footerEl.innerText;
      const match = text.match(/Generated\s+on\s+(.+)/i);
      if (match) {
        return match[1].trim();
      }
      else {
        console.error('Footer element found, but no text match could be generated');
        return '';
      }
    }
    else {
      console.warn('Footer element not found!');
      return '';
    }
  })();
  console.log('FOOTER:', DOXY_TIME);

  const lastModString = document.lastModified;
  const lastModDate = new Date(lastModString);
  console.log('document.lastModified:', lastModDate.toLocaleString());

  

  const DOC_ROOT = (() => {
    // Determine the base path (DOC_ROOT) of the current documentation site.
    // This is useful for loading assets (e.g., CSS/JS) relative to the script location,
    // even when the script is located in a nested folder or executed in varied contexts.
    // ⚠️ NOTE: This is a IIFE (Immediately Invoked Function Expression) and it runs immediately
    // at defination time and the resulting string is stored in DOC_ROOT. Every time DOC_ROOT
    // is referenced afterward, it is getting that cached value, not re-running the function.

    // Helper function: Extracts the folder path from a full URL.
    // Example: "https://example.com/docs/js/script.js" -> "https://example.com/docs/js/"
    // Example: "file:///F:/Doxy/Z_Test/Test_5/html/script.js" -> "file:///F:/Doxy/Z_Test/Test_5/html/"
    const getDir = src => src.slice(0, src.lastIndexOf('/') + 1);
    // Primary method: Use 'document.currentScript' to get the <script> element currently executing.
    // This is the most accurate and modern way to locate the script's own path.
    const self = document.currentScript;
    if (self && self.src) {
      let dir = getDir(self.src); // The folder path of the script itself.
      return dir;
    }

    // Fallback: If 'currentScript' is unavailable (e.g., in older browsers or dynamic environments),
    // try to locate a known Doxygen-generated script like 'navtreedata.js'.
    // This file typically resides in the root documentation folder.
    const tree = document.querySelector('script[src$="navtreedata.js"]');
    if (tree && tree.src) {
      let dir = getDir(tree.src); // The folder path where 'navtreedata.js' is located.
      console.warn(`Root: ${dir} (Determined by navtreedata.js file)`);
      return dir;
    }

    // Final fallback: If both methods fail, fall back to the root of the current origin.
    // Example: If on "https://example.com/docs/page.html", this gives "https://example.com/"
    // ⚠️ NOTE: This will result in "file://" when opened directly from folder
    const dir = window.location.origin + '/';
    console.error(`Root: ${dir} (Ultimate Fallback)`);
    return dir;
  })();

  const IS_CLASS_OR_STRUCT_PAGE = (() => {
    // Determines if the current page is for a class or struct. If it is then its member signatures
    // will be shown in the secondary nav if dual nav is set to true. This value is used in the
    // function that generates member signatures to determine if it should run ot not.
    // ⚠️ NOTE: This is a IIFE (Immediately Invoked Function Expression) and it runs immediately
    // at defination time and the resulting string is stored in IS_CLASS_OR_STRUCT_PAGE. Every time
    // IS_CLASS_OR_STRUCT_PAGE is referenced afterwards, it is getting the cached value.
    const lastPart = window.location.pathname.split('/').pop().toLowerCase(); // grab last segment of the path after last /
    return lastPart.startsWith('class') || lastPart.startsWith('struct'); // test for “class…” or “struct…” at the very start of last segment
  })();

  const HTML_NAME = (() => {
    if (IS_CLASS_OR_STRUCT_PAGE) {
      return window.location.pathname.split('/').pop().toLowerCase().replace(/\..*$/, '');
    }
    else {
      return null;
    }
  })();

  const PROJ_NAMESPACE = (() => {
    // 1) Strip any trailing slashes
    let raw = DOC_ROOT.replace(/\/+$/, '');

    // 2) Remove protocol (e.g. “https://” or “file:///”)
    raw = raw.replace(/^[a-z]+:\/\//i, '');

    // 3) Drop any credentials before an “@”
    raw = raw.replace(/^[^\/@]+@/, '');

    // 4) Remove query string or fragment
    raw = raw.split(/[?#]/, 1)[0];

    // 5) For Windows drives, drop the colon after the letter (e.g. “F:” → “F”)
    raw = raw.replace(/^([A-Za-z]):/, '$1');

    // 6) Split on both “/” and “\”, filter out empty segments
    const parts = raw.split(/[\/\\]+/).filter(Boolean);

    // 7) Slugify each segment (allow only A–Z, a–z, 0–9, underscore, dash)
    const slugged = parts.map(seg =>
      seg
        .replace(/[^A-Za-z0-9_-]+/g, '-')  // invalid → “-”
        .replace(/-+/g, '-')               // collapse multiple “-”
        .replace(/^-+|-+$/g, '')           // trim leading/trailing “-”
    );

    // 8) Join with dash and return
    return slugged.join('-');
  })();

  const STORAGE = store.namespace(PROJ_NAMESPACE);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 CONSTANTS

  // #region 🟩 PURGE EXPIRED STORED DATA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  (function () {
    const PRE = '__storejs___storejs_';
    const SEP = '_expire_mixin_';
    Object.keys(localStorage).forEach(fullKey => {
      if (fullKey.startsWith(PRE) && fullKey.indexOf(SEP, PRE.length) !== -1) {
        const rem = fullKey.slice(PRE.length);
        const [nsName, actualKey] = rem.split(SEP, 2);
        const nsStore = store.namespace(nsName);
        const showDebugOutput = false; // set it to true to see the debug outputs
        if (showDebugOutput) {
          const expiresAt = nsStore.getExpiration(actualKey);
          const isExpired = expiresAt != null && Date.now() > expiresAt;
          const val = nsStore.get(actualKey);
          if (isExpired) {
            console.log(`Expired: ${nsName} -> ${actualKey} -> ${val} -> ${expiresAt}`);
          }
          else {
            console.log(`Valid: ${nsName} -> ${actualKey} -> ${val} -> ${expiresAt}`);
          }
        }
        else {
          nsStore.get(actualKey); // if expired it will remove this key
        }
      }
    });
  })();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 PURGE EXPIRED STORED DATA

  // #region 🟩 GLOBAL VARIABLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // numbers
  let _wPri = loadNum(KEY__PRI_WIDTH, 250);
  let _wSec = loadNum(KEY__SEC_WIDTH, 250);
  let _docMarginStableFrames = 0;

  // strings
  let _consoleObjectName = '';
  let _secTreeRemarks = '';

  // booleans
  let _dualNav = load(KEY__DUAL_NAV, true);

  // sets and arrays
  let _priTree = [];
  let _secTree = [];
  let _priExpNodes = new Set();
  let _secColNodes = new Set();

  // objects
  let _adjustXandH_resizeObserver = null;

  // saving so that expiry time will be updated
  save(KEY__DUAL_NAV, _dualNav);
  save(KEY__PRI_WIDTH, _wPri);
  save(KEY__SEC_WIDTH, _wSec);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GLOBAL VARIABLES

  // #region 🟩 HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function save(key, val) {
    STORAGE.set(key, val, Date.now() + TIME_TO_LIVE);
  }

  // For a value `val = undefined`
  // `val == null` is true but `val === null` is false
  // `val != null` is false but `val !== null` is true

  function load(key, defVal = null) {
    // returns undefined (which is slightly different than null) if the key does not exist or is expired
    const v = STORAGE.get(key);
    return v === undefined ? defVal : v;
  }

  function loadNum(key, defVal = null) {
    // returns undefined (which is slightly different than null) if the key does not exist or is expired
    const v = STORAGE.get(key);
    if (v == null) return defVal; // == treats null and undefined as same but === does not
    const n = Number(v);
    return isNaN(n) ? defVal : n;
  }

  function debounce(fn, ms) {
    // A way to “coalesce” a rapid burst of events into a single call after things have settled down.
    let t;                                   // holds the pending timeout ID
    return (...args) => {                    // returns a wrapped version of `fn`
      clearTimeout(t);                       // cancel any previous scheduled call
      t = setTimeout(() => fn(...args), ms); // schedules a new call with latest args after 'ms' milliseconds
    };
  }

  function waitFor(selector) {
    // Waits for the first element matching any CSS selector.
    // selector: Any valid querySelector string.
    // Returns: Promise<Element>
    return new Promise((resolve, reject) => {
      // Immediate hit?
      const el = document.querySelector(selector);
      if (el) {
        //console.log(`Selector "${selector}" found immediately, no need for mutation observer`);
        return resolve(el);
      }

      // pre-declare the timer variable for the closure
      let timer;

      // Otherwise observe mutations until we find one
      // In MutationObserver, first argument '_' is an
      // intentionally unused parameter, by using '_'
      // it means we are watching for any change. The
      // second argument 'observer' is the own 'obs'
      // instance.
      const obs = new MutationObserver((_, observer) => {
        const found = document.querySelector(selector);
        if (found) {
          //console.log(`Selector "${selector}" found in mutation observer, Task Complete!`);
          observer.disconnect();
          clearTimeout(timer);
          resolve(found);
        }
        //else{
        //  console.log(`Selector "${selector}" NOT found in mutation observer, Looking...`);
        //}
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // Give up after timeout
      timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timed out waiting for selector "${selector}" after ${TIMEOUT} ms`));
      }, TIMEOUT);
    });
  }

  function printTreeTableFormat(tree) {
    function flattenTree(oldTree, preName = '', newTree = []) {
      for (let ii = 0; ii < oldTree.length; ++ii) {
        const newName = preName === '' ? oldTree[ii][0] : preName + " → " + oldTree[ii][0];
        if (Array.isArray(oldTree[ii][2]) && oldTree[ii][2].length > 0) {
          newTree.push({ Name: newName, Link: oldTree[ii][1], Kids: oldTree[ii][2].length });
          flattenTree(oldTree[ii][2], newName, newTree);
        }
        else {
          newTree.push({ Name: newName, Link: oldTree[ii][1], Kids: null });
        }
      }
      return newTree;
    }
    console.table(flattenTree(tree));
  }

  function printTreeGroupFormat(tree) {
    tree.forEach(([name, href, kids]) => {
      if (Array.isArray(kids)) {
        if (kids.length > 0) {
          console.group(`${name} → ${href} → Kids: ${kids.length}`);
          printTreeGroupFormat(kids);
          console.groupEnd();
        }
        else {
          console.log(`${name} → ${href} → Kids: 0`);
        }
      }
      else {
        console.log(`${name} → ${href} → ${kids}`);
      }
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 HELPERS

  // #region 🟩 SEARCH PLACEHOLDER TWEAK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function searchPlaceholderTweak() {

    // this function updates the placeholder text in the search box
    async function update() {
      const start = performance.now();
      while (!window.searchBox || !window.indexSectionLabels) {
        const elapsed = performance.now() - start;
        if (elapsed > TIMEOUT) {
          console.error(`Search Placeholder Tweak - Update: Timed out waiting for selector "window.searchBox" and/or "window.indexSectionLabels" after ${elapsed} ms`);
          return;
        }
        //console.log(`Search Placeholder Tweak - Update: Waiting for "window.searchBox" and/or "window.indexSectionLabels" after ${elapsed} ms...`);
        await new Promise(requestAnimationFrame);
      }
      const label = window.indexSectionLabels[window.searchBox.searchIndex] || 'All';
      const field = await waitFor('#MSearchField');
      field.setAttribute('placeholder', `Search ${label}`);
      //console.log(`Search Placeholder Tweak - Update: SUCCESS "Search ${label}"`);
    }

    //await update(); // no need to call here, the window.searchBox.OnSelectItem is triggered automatically the first time

    // wait till required parts are available
    const startTimeOnSelectItem = performance.now();
    while (!window.searchBox || !window.searchBox.OnSelectItem) {
      const elapsed = performance.now() - startTimeOnSelectItem;
      if (elapsed > TIMEOUT) {
        console.error(`Search Placeholder Tweak: Timed out waiting for selector "window.searchBox" and/or "window.searchBox.OnSelectItem" after ${elapsed} ms`);
        return;
      }
      //console.log(`Search Placeholder Tweak: Waiting for "window.searchBox" and/or "window.searchBox.OnSelectItem" after ${elapsed} ms...`);
      await new Promise(requestAnimationFrame);
    }

    // Run the update again when user changes the from search dropdown
    if (typeof window.searchBox.OnSelectItem === 'function') {
      const orig = window.searchBox.OnSelectItem;
      window.searchBox.OnSelectItem = function (id) {
        const ret = orig.call(this, id);
        //console.log('Search Placeholder Tweak: Update On Select Item Triggered');
        update();
        return ret;
      };
    }
    else {
      console.error('window.searchBox.OnSelectItem is not a function');
      return;
    }

    // The search bar updates when resizing, so listen to it, debounce till it settles and then call updatePlaceholder
    // ⚠️ NOTE: debounce is needed because without it the update function runs but the placeholder remains not update
    // on resize. I think this is because without debounce the placeholder is updated very fast and afterwards the
    // searchbox itself is re-created by Doxygen or Doxygen Awesome theme thus removing the updated placeholder text.
    window.addEventListener('resize', debounce(update, 50));
    //console.log('Search Placeholder Tweak: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SEARCH PLACEHOLDER

  // #region 🟩 SIDE NAV TWEAK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function sideNavTweak() {

    // We have to wait for the two parts and we do it simultaneously by using 'await Promise.all...'
    const sideNavPromise = waitFor('#side-nav');
    const firstLiPromise = waitFor('#side-nav #nav-tree-contents ul > li, #side-nav #nav-tree ul > li');
    const [sideNav, firstLi] = await Promise.all([sideNavPromise, firstLiPromise]);
    const sideNavTreeUl = firstLi.parentElement; // now we know the UL exists and has at least one LI

    // Bump all childs of the top level item to the top lebvel then remove the original top level
    // item which will be empty now. This is done because the default navigation tree generated by
    // Doxygen has only one top top level item (usually called "Main Page") and its children are
    // items like "Namespaces", "Concepts", "Classes", etc. Having only one top level item seems
    // useless, so I remove it and have all its child as top level items.
    // ⚠️ NOTE: If in future the top level item is needed then just comment out the below part.
    const nested = firstLi.querySelector('ul');
    if (nested) {
      for (const li of Array.from(nested.children)) { // for…of gives you callback-free, breakable loops
        sideNavTreeUl.appendChild(li);
      }
    }
    firstLi.remove();

    // This function swaps ►/▼ for ●/○ everywhere. By default Doxygen does not populate all
    // childs in the nav tree, only when a node is expanded that its children are shown. What below
    // section does is to listen to when the side-nav is changed i.e. a node is expanded/collapsed
    // then swaps ►/▼ for ●/○. This way the icons for expand/collapse is always ●/○.
    function replaceArrows() {
      mo.disconnect();
      sideNav.querySelectorAll('span.arrow').forEach(span => {
        const t = span.textContent.trim();
        if (t === '►') span.textContent = '\u25CF\uFE0F';
        else if (t === '▼') span.textContent = '\u25CB\uFE0F';
      });
      //console.log('Side Nav Tweak - Replace Arrows: SUCCESS');
      mo.observe(sideNav, { childList: true, subtree: true });
    }
    const mo = new MutationObserver(replaceArrows);
    replaceArrows(); // replace arrows initially

    //console.log('Side Nav Tweak: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SIDE NAV TWEAK

  // #region 🟩 SIDEBAR TOGGLE BUTTON
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function sidebarToggleButton() {
    const itemSearchBox = await waitFor('#searchBoxPos2');
    function setup() {
      mo.disconnect();
      const winWidth = window.innerWidth || document.documentElement.clientWidth;
      if (winWidth >= 768) {
        let btn = itemSearchBox.querySelector('.dp-sidebar-toggle-btn');
        if (btn) {
          itemSearchBox.appendChild(btn);
          const icon = btn.querySelector("img");
          icon.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
          //console.log('Sidebar Toggle Button - Setup: Reposition');
        }
        else {
          btn = document.createElement('a');
          btn.className = 'dp-sidebar-toggle-btn';
          btn.href = '#';
          btn.title = 'Toggle Single/Double Navigation Sidebar';

          const img = document.createElement('img');
          img.width = 24;
          img.height = 24;
          img.alt = 'Dual Sidebar Toggle Icon';
          img.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
          btn.appendChild(img);

          btn.addEventListener('click', evt => {
            evt.preventDefault();
            _dualNav = !_dualNav;
            img.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
            save(KEY__DUAL_NAV, _dualNav)
            //setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);
            //console.log(`Sidebar Toggle Button - Click: DualNav = ${_dualNav}`);
          });

          itemSearchBox.appendChild(btn);
          //console.log('Sidebar Toggle Button - Setup: New Button');
        }
      }
      //else {
      //  console.log('Sidebar Toggle Button - Setup: Width < 768');
      //}
      mo.observe(itemSearchBox, { childList: true });
    }
    const mo = new MutationObserver(setup);
    //mo.observe(itemSearchBox, { childList: true });
    setup();
    //console.log('Sidebar Toggle Button: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SIDEBAR TOGGLE BUTTON

  // #region 🟩 DUAL NAV FUNCTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function setDualPriNavWidth(w) {
    if (w !== _wPri) {
      _wPri = w;
      save(KEY__PRI_WIDTH, w);
    }
  }

  function setDualSecNavWidth(w) {
    if (w !== _wSec) {
      _wSec = w;
      save(KEY__SEC_WIDTH, w);
    }
  }

  async function dualNavLayout() {
    const doc = await waitFor('#doc-content');
    const docMargin = window.getComputedStyle(doc).marginLeft;
    const wWin = window.innerWidth;
    if (wWin < 768) {
      if (docMargin !== '0px') {
        doc.style.setProperty('margin-left', '0px', 'important');
        //console.log('Dual Nav Layout: Window size is less than 768 pixels and doc margin was not 0 pixels, it is set to 0 pixels now');
      }
    }
    else {
      const priP = waitFor('#dp-pri-nav');
      const priResP = waitFor('#dp-pri-nav-resizer');
      const secP = waitFor('#dp-sec-nav');
      const secResP = waitFor('#dp-sec-nav-resizer');
      const [pri, priRes, sec, secRes] = await Promise.all([priP, priResP, secP, secResP]);

      const maxTotal = wWin - GUTTER_W;
      if (_secTree.length > 0) {
        const total = _wPri + _wSec;
        if (total > maxTotal) {
          // compute proportional sizes
          const ratio = _wPri / total;
          let newPri = Math.floor(maxTotal * ratio);
          let newSec = maxTotal - newPri;

          // enforce minimum on either one
          if (newPri < MIN_W) {
            newPri = MIN_W;
            newSec = maxTotal - newPri;
          }
          if (newSec < MIN_W) {
            newSec = MIN_W;
            newPri = maxTotal - newSec;
          }

          setDualPriNavWidth(newPri);
          setDualSecNavWidth(newSec);
        }

        $(pri).css({ width: _wPri + 'px' });
        $(priRes).css({ left: (_wPri - 2) + 'px' });
        $(sec).css({ left: _wPri + 'px', width: _wSec + 'px' });
        $(secRes).css({ left: (_wPri + _wSec - 2) + 'px' });

        const newDocMargin = _wPri + _wSec + 'px';
        if (_dualNav && docMargin !== newDocMargin) {
          doc.style.setProperty('margin-left', newDocMargin, 'important');
        }
      }
      else {
        if (_wPri > maxTotal) {
          setDualPriNavWidth(maxTotal);
        }

        $(pri).css({ width: _wPri + 'px' });
        $(priRes).css({ left: (_wPri - 2) + 'px' });

        const newDocMargin = _wPri + 'px';
        if (_dualNav && docMargin !== newDocMargin) {
          doc.style.setProperty('margin-left', newDocMargin, 'important');
        }
      }

      //console.log('Dual Nav Layout: SUCCESS');
    }
  }

  function dualNavResizer(resizerId, getW) {

    // no args? wire both and return
    if (!resizerId) {
      dualNavResizer('dp-pri-nav-resizer', () => _wPri);
      dualNavResizer('dp-sec-nav-resizer', () => _wSec);
      return;
    }

    const maxTotal = () => window.innerWidth - GUTTER_W;
    const resizer = document.getElementById(resizerId);
    let startX = 0, startW = 0, raf = null;

    function onMove(ev) {
      ev.preventDefault();
      if (raf) return;
      raf = requestAnimationFrame(() => {
        let newW = startW + (ev.clientX - startX);
        if (resizerId === 'dp-sec-nav-resizer') {
          if (newW < MIN_W) {
            const over = MIN_W - newW;
            const secNew = MIN_W;
            const priNew = Math.max(MIN_W, _wPri - over);
            if (secNew != _wSec || priNew != _wPri) {
              setDualPriNavWidth(priNew);
              setDualSecNavWidth(secNew);
              dualNavLayout();
              startX = ev.clientX;
              startW = secNew;
            }
          }
          else {
            if (newW > (maxTotal() - _wPri))
              newW = maxTotal() - _wPri;
            if (newW != _wSec) {
              setDualSecNavWidth(newW);
              dualNavLayout();
            }
          }
        }
        else {
          if (_secTree.length > 0) {
            newW = Math.max(MIN_W, Math.min(maxTotal() - MIN_W, newW));
            if (newW != _wPri) {
              if (newW < _wPri)
                setDualSecNavWidth(_wSec + (_wPri - newW));
              else {
                if (newW + _wSec > maxTotal()) {
                  setDualSecNavWidth(maxTotal() - newW);
                }
                else if (_wSec > MIN_W) {
                  const secNew = Math.max(MIN_W, _wSec - (newW - _wPri));
                  if (secNew != _wSec)
                    setDualSecNavWidth(secNew);
                }
              }
              setDualPriNavWidth(newW);
              dualNavLayout();
            }
          }
          else {
            newW = Math.max(MIN_W, Math.min(maxTotal(), newW));
            if (newW != _wPri) {
              setDualPriNavWidth(newW);
              dualNavLayout();
            }
          }
        }
        raf = null;
      });
    }

    function onUp(evtUp) {
      evtUp.preventDefault();
      document.body.style.cursor = '';
      //resizer.releasePointerCapture(evtUp.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    }

    resizer.addEventListener('pointerdown', evtDown => {
      evtDown.preventDefault();
      //resizer.setPointerCapture(evtDown.pointerId);
      startX = evtDown.clientX;
      startW = getW();
      document.body.style.cursor = 'ew-resize';
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp, { passive: false });
      document.addEventListener('pointercancel', onUp, { passive: false });
    }, { passive: false });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DUAL NAV FUNCTIONS

  // #region 🟩 GEN DEF TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genDefTree() {

    // wait until NAVTREE[0][2] exists and is a non-empty array
    const start = performance.now();
    while (
      !window.NAVTREE ||
      !Array.isArray(window.NAVTREE) ||
      window.NAVTREE.length === 0 ||
      !Array.isArray(window.NAVTREE[0]) ||
      window.NAVTREE[0].length < 3 ||
      !Array.isArray(window.NAVTREE[0][2])
    ) {
      const elapsed = performance.now() - start;
      if (elapsed > TIMEOUT) {
        console.error(`Gen Def Tree: Timed out waiting for selector "NAVTREE[0][2]" after ${elapsed} ms`);
        return null;
      }
      console.log(`Gen Def Tree: Waiting for "NAVTREE[0][2]" after ${elapsed} ms...`);
      await new Promise(requestAnimationFrame);
    }

    function cloneTree(tree) {
      return tree.map(([name, href, kids]) => {
        const clonedKids = Array.isArray(kids) ? cloneTree(kids) : kids;
        return [name, href, clonedKids];
      });
    }

    function loadScript(relUrl) {
      return new Promise((res, rej) => {
        const fullUrl = new URL(relUrl, DOC_ROOT).href; // build an absolute URL from a relative path and a base root.
        const s = document.createElement('script'); s.src = fullUrl; s.async = true; // create and configure a <script> tag.
        s.onload = () => res(); // when the script finishes loading, call resolve()
        s.onerror = err => rej(err); // if the script fails to load, call reject(err)
        document.head.appendChild(s); // insert the <script> tag into the page and kicks off the download.
      });
    }

    function loadChildren(tree) {
      const promises = [];
      tree.forEach(node => {
        const c = node[2];
        if (typeof c === 'string') {
          promises.push(
            loadScript(c + '.js')
              .then(() => {
                let arr = window[c];
                if (!Array.isArray(arr)) arr = window[c.split('/').pop()];
                node[2] = Array.isArray(arr) ? arr : [];
                return loadChildren(node[2]);
              })
              .catch(() => { node[2] = []; })
          );
        } else if (Array.isArray(c)) {
          promises.push(loadChildren(c));
        }
      });
      return Promise.all(promises);
    }

    // clone the default tree, load children, and return it
    const defTree = cloneTree(window.NAVTREE[0][2]);
    await loadChildren(defTree);
    console.log('Gen Def Tree: SUCCESS');
    return defTree;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GEN DEF TREE

  // #region 🟩 GEN PRI TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genPriTree() {

    // setting the two array's lengths as 0 so that it is reinitialized
    // while maintaining previous links
    _priTree.length = 0;

    // read the previous stored doxygen time (returns null if nothing was stored)
    const prvDoxyTime = load(KEY__GEN_DATA);

    // read the current doxygen time obtained from footer
    let curDoxyTime = null;
    try {
      const footerEl = await waitFor('#nav-path li.footer');
      const text = footerEl.textContent || footerEl.innerText;
      const match = text.match(/Generated\s+on\s+(.+)/i);
      if (match) {
        curDoxyTime = match[1].trim();
      } else {
        console.warn(`Gen Pri Tree: Could not find “Generated on …” in "#nav-path li.footer" element`);
      }
    } catch (err) {
      console.error(`Gen Pri Tree: Error waiting for footer "#nav-path li.footer" element:`, err);
    }

    // read the stored arrays if current time is same as previous time
    if (prvDoxyTime != null && prvDoxyTime === curDoxyTime) {
      const priTree = load(KEY__PRI_TREE);
      if (priTree != null && Array.isArray(priTree) && priTree.length > 0) {
        // assign the primary tree
        _priTree = priTree;

        // saving so that expiry time is updated
        save(KEY__GEN_DATA, curDoxyTime);
        save(KEY__PRI_TREE, _priTree);

        //console.log(`Gen Pri Tree: Loaded from Session Storage`);

        // return since there is no need to process any further data in this function
        return;
      }
    }

    // flatAndPrune(tree, sep = '', filters = [])
    // Flattens a nested [name, path, kids] tree into a flat array of [prefixedName, path, null] entries.
    // Drops any node whose path contains “#”.
    // If `filters` is non-empty, only keeps nodes whose filename starts with one of the filter strings.
    // Returns null if no nodes survive.
    function flatAndPrune(tree, sep = '', filters = []) {

      const result = [];

      if (!Array.isArray(tree) || tree.length === 0) {
        return result;
      }

      const hasFilter = filters.length > 0;

      (function collect(branch, prefix = '') {
        for (const [name, path, kids] of branch) {
          // build the new hierarchical name
          const prefixedName = prefix ? `${prefix}${sep}${name}` : name;

          // only consider real HTML pages without anchors when there is either no filter or starts with filter
          if (typeof path === 'string') {
            const htmlName = path.split('/').pop();
            if (!htmlName.includes('#') && IS_HTML_END.test(htmlName) && (!hasFilter || filters.some(f => htmlName.startsWith(f)))) {
              result.push([prefixedName, path, null]);
            }
          }

          // recurse into children regardless—so deeper matches still appear
          if (Array.isArray(kids) && kids.length) {
            collect(kids, prefixedName);
          }
        }
      })(tree);

      return result;
    }

    function findNodeByNameList(tree, ...nameList) {
      if (!Array.isArray(tree) || nameList.length === 0) return null;
      let level = tree;
      let node = null;
      for (const name of nameList) {
        node = level.find(item => item[0] === name) || null;
        if (!node) return null;
        level = Array.isArray(node[2]) ? node[2] : [];
      }
      return node;
    }

    // get the default NAVTREE
    const defTree = await genDefNavTree();
    if (!Array.isArray(defTree) || defTree.length === 0) {
      console.warn('Gen Pri Tree: Default tree returned by "genDefTree" is either not an array or is empty');
      return;
    }

    _priTree.push(['Bet A', null, null]);

    const nsListNode = findNodeByNameList(defTree, 'Namespaces', 'Namespace List');
    if (nsListNode) {
      const [, href, kids] = nsListNode;
      if (typeof href === 'string' && IS_HTML_END.test(href) && Array.isArray(kids)) {
        const list = flatAndPrune(kids, '::', ['namespace']);
        if (list.length > 0) {
          _priTree.push(['Namespaces', href, list]);
        }
      }
    }
    _priTree.push(['Bet B', null, null]);

    const nsMemNode = findNodeByNameList(defTree, 'Namespaces', 'Namespace Members');
    if (nsMemNode) {
      const [, href, kids] = nsMemNode;
      if (Array.isArray(kids) && kids.length > 0) {
        let temp = flatAndPrune(kids, '::');
        if (temp.length > 0) {
          let idx = -1;
          for (let ii = 0; ii < temp.length; ++ii) {
            if (temp[ii][0] === 'All') {
              idx = ii;
              break;
            }
          }
          if (idx > -1) {
            let tempHref = temp[idx][1];
            temp.splice(idx, 1);
            if (typeof tempHref === 'string' && IS_HTML_END.test(tempHref) && temp.length > 0) {
              _priTree.push(['Globals', tempHref, temp]);
            }
          }
        }
      }
    }

    const conceptsNode = findNodeByNameList(defTree, 'Concepts');
    if (conceptsNode) {
      const [, href, kids] = conceptsNode;
      const list = flatAndPrune(kids, '::', ['concept'])
      if (typeof href === 'string' && IS_HTML_END.test(href) && list.length > 0) {
        _priTree.push(['Concepts', href, list]);
      }
    }

    let classListInserted = false;
    const classListNode = findNodeByNameList(defTree, 'Classes', 'Class List');
    if (classListNode) {
      const [, href, kids] = classListNode;
      const list = flatAndPrune(kids, '::', ['class', 'struct'])
      if (typeof href === 'string' && IS_HTML_END.test(href) && list.length > 0) {
        classListInserted = true;
        _priTree.push(['Classes', href, list]);
      }
    }

    if (classListInserted) {
      const classHierarchyNode = findNodeByNameList(defTree, 'Classes', 'Class Hierarchy');
      if (classHierarchyNode) {
        const [, href, kids] = classHierarchyNode;
        if (typeof href === 'string' && IS_HTML_END.test(href)) {
          _priTree[_priTree.length - 1][2].push(['[Hierarchy]', href, null]);
        }
      }

      const classIndexNode = findNodeByNameList(defTree, 'Classes', 'Class Index');
      if (classIndexNode) {
        const [, href, kids] = classIndexNode;
        if (typeof href === 'string' && IS_HTML_END.test(href)) {
          _priTree[_priTree.length - 1][2].push(['[Index]', href, null]);
        }
      }
    }

    const classMembersNode = findNodeByNameList(defTree, 'Classes', 'Class Members');
    if (classMembersNode) {
      const [, href, kids] = classMembersNode;
      if (Array.isArray(kids) && kids.length > 0) {
        let temp = flatAndPrune(kids, '::');
        if (temp.length > 0) {
          let idx = -1;
          for (let ii = 0; ii < temp.length; ++ii) {
            if (temp[ii][0] === 'All') {
              idx = ii;
              break;
            }
          }
          if (idx > -1) {
            let tempHref = temp[idx][1];
            temp.splice(idx, 1);
            if (typeof tempHref === 'string' && IS_HTML_END.test(tempHref) && temp.length > 0) {
              _priTree.push(['Class Members', tempHref, temp]);
            }
          }
        }
      }
    }

    const filesNode = findNodeByNameList(defTree, 'Files', 'File List');
    if (filesNode) {
      const [, href, kids] = filesNode;
      const list = flatAndPrune(kids, '/', ['_', 'dir_'])
      if (typeof href === 'string' && IS_HTML_END.test(href) && list.length > 0) {
        _priTree.push(['Files', href, list]);
      }
    }

    _priTree.push(['Ind A', null, null]);
    _priTree.push(['Ind B', null, null]);

    _priTree.push([
      'Level 0',
      null,
      [
        [  // ← child-array starts here
          'Level 1',
          null,
          [
            ['Level A', null, null],
            ['Level B', null, null],
            ['Level C', null, null],
            [
              'Level 2',
              null,
              [
                ['Level x', null, null],
                [
                  'Level 3',
                  null,
                  [
                    [
                      'Level 4',
                      null,
                      [
                        ['Level 5', null, null]
                      ]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]  // ← end of children of Level 0
      ]
    ]);

    _priTree.push(['Ind C', null, null]);

    save(KEY__GEN_DATA, curDoxyTime);
    save(KEY__PRI_TREE, _priTree);

    //console.log(`Gen Pri Tree: Generated`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GEN PRI TREE

  // #region 🟩 GEN SEC TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genSecTree() {

    _secTree.length = 0;
    _secTreeRemarks = '';

    if (!IS_CLASS_OR_STRUCT_PAGE) {
      _secTreeRemarks = 'Not a Class or Struct Page';
      //console.log('Gen Sec Tree: Not a Class or Struct Page');
      return;
    }

    let contents = null;
    try {
      contents = await waitFor('div.contents, div.content, main');
    }
    catch (err) {
      console.error('Gen Sec Tree: Error waiting for "div.contents, div.content, main"', err);
      return;
    }

    if (contents == null) {
      console.error(`Gen Sec Tree: "div.contents, div.content, main" not found`);
      return;
    }

    const tables = Array.from(contents.querySelectorAll("table.memberdecls"));
    if (tables.length === 0) {
      _secTreeRemarks = 'Empty "table.memberdecls" element array';
      //console.log('Gen Sec Tree: Empty "table.memberdecls" element array');
      return;
    }

    function formatSignature(text) {
      if (typeof text !== 'string') return text;

      return text
        // Remove space before *, &, &&
        .replace(/\s+([*&]{1,2})/g, '$1')
        // Ensure space after *, &, &&
        .replace(/([*&]{1,2})(?!\s)/g, '$1 ')

        // Remove spaces inside <...>
        .replace(/<\s+/g, '<')
        .replace(/\s+>/g, '>')
        .replace(/\s+<\s+/g, '<')
        .replace(/\s+>\s+/g, '>')

        // Remove space before commas, ensure one after
        .replace(/\s+,/g, ',')
        .replace(/,(?!\s)/g, ', ')

        // Remove space after ( and before )
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')

        // ❗ Remove space before (
        .replace(/\s+\(/g, '(')

        // Add space before and after = in special cases
        .replace(/\s*=\s*(default|delete|0)/g, ' = $1')

        // Collapse multiple spaces and trim
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    const headers = Array.from(contents.querySelectorAll("h2.groupheader"));
    tables.forEach((table, idx) => {
      const grpSigs = [];
      const seenName = new Set();
      const seenHref = new Set();

      const headName = headers[idx]?.textContent.trim() || `Members ${idx + 1}`;

      const headerEl = headers[idx];
      const anchorEl = headerEl.querySelector("a[id], a[name]");
      const anchorId = anchorEl?.getAttribute("id") || anchorEl?.getAttribute("name") || null;
      const headHref = anchorId ? `#${anchorId}` : null;

      table.querySelectorAll("a[href^='#']").forEach(a => {
        if (a.closest("div.memdoc") || a.closest("td.mdescRight")) return;

        const leafHref = a.getAttribute("href");
        if (seenHref.has(leafHref)) {
          return;
        }

        const row = a.closest("tr");
        if (!row) {
          return;
        }
        const tds = row.querySelectorAll("td");
        if (tds.length < 2) {
          return;
        }

        const lftText = tds[0].innerText.replace(/\s+/g, ' ').trim();
        const ritText = tds[1].innerText.replace(/\s+/g, ' ').trim();
        let leafNameTemp = `${lftText} ${ritText}`.trim();
        let leafName = formatSignature(leafNameTemp);
        if (leafName.startsWith('enum')) {
          leafName = leafName.replace(/\s*\{[\s\S]*\}/, '').trim();
        }
        if (seenName.has(leafName)) {
          return;
        }

        seenHref.add(leafHref);
        seenName.add(leafName);

        grpSigs.push([leafName, leafHref, null]);
      });

      if (grpSigs.length > 0) {
        _secTree.push([headName, headHref, grpSigs]);
      }
    });

    if (_secTree.length > 0) {
      _secTreeRemarks = 'Successfully generated member signatures';
      //console.log('Gen Sec Tree: Successfully generated member signatures');
    }
    else {
      _secTreeRemarks = 'No member signature found';
      //console.log('Gen Sec Tree: No member signature found');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GEN SEC TREE

  // #region 🟩 DISPLAY DEF TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function displayDefTree(groupFormat = true) {
    const defTree = await genDefTree();
    if (Array.isArray(defTree) && defTree.length > 0) {
      if (groupFormat) {
        printTreeGroupFormat(defTree);
      }
      else {
        printTreeTableFormat(defTree);
      }
    }
    else {
      console.log('Default Tree is EMPTY');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DISPLAY DEF TREE

  // #region 🟩 DISPLAY MISSED HTML PAGES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function displayMissedHtmlPages() {

    const seenHtml = new Set();
    if (Array.isArray(_priTree) && _priTree.length > 0) {
      (function markSeen(tree) {
        if (!Array.isArray(tree) || tree.length === 0) return;
        for (const [, href, kids] of tree) {
          if (typeof href === 'string' && IS_HTML_END.test(href) && !seenHtml.has(href)) seenHtml.add(href);
          if (Array.isArray(kids)) markSeen(kids);
        }
      })(_priTree);
    }

    const defTree = await genDefTree();
    if (Array.isArray(defTree) && defTree.length > 0) {
      const collected = new Set();
      let missedPages = [];
      (function collect(tree, parName = '') {
        if (!Array.isArray(tree) || tree.length === 0) return;
        for (const [name, href, kids] of tree) {
          const fullName = parName === '' ? name : parName + " → " + name;
          if (typeof href === 'string') {
            const link = href.replace(/(\.html)#.*$/, '$1');
            if (IS_HTML_END.test(link) && !seenHtml.has(link) && !collected.has(link)) {
              collected.add(link);
              missedPages.push({ Name: fullName, Link: link });
            }
          }
          if (Array.isArray(kids)) {
            collect(kids, fullName);
          }
        }
      })(defTree);

      if (missedPages.length > 0) {
        console.log('Below is a list of all HTML pages that are present in default NAVTREE but are not included in Primary Tree shown with Dual Navigation Sidebar style.')
        console.table(missedPages);
      }
      else {
        console.log('Generated Primary Tree of Dual Navigation Sidebar has all the HTML Pages that are present in default NAVTREE');
      }
    }
    else {
      console.error('Unable to get Default NAVTREE');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DISPLAY MISSED HTML PAGES

  // #region 🟩 STABILIZE DOC MARGIN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function stabilizeDocMargin() {
    const doc = await waitFor('#doc-content');
    let newMargin = '0px';
    if (window.innerWidth >= 768) {
      if (_dualNav) {
        if (_secTree.length > 0) {
          newMargin = _wPri + _wSec + 'px';
        }
        else {
          newMargin = _wPri + 'px';
        }
      }
      else {
        const nav = await waitFor('#side-nav');
        newMargin = window.getComputedStyle(nav).width;
      }
    }

    const docMargin = window.getComputedStyle(doc).marginLeft;
    if (docMargin !== newMargin) {
      doc.style.setProperty('margin-left', newMargin, 'important');
      _docMarginStableFrames = 0;
      requestAnimationFrame(stabilizeDocMargin);
      //console.log(`Stabilize Doc Margin: Current = ${docMargin}, New = ${newMargin}`);
    }
    else {
      _docMarginStableFrames++;
      //console.log(`Stabilize Doc Margin: Stable ${newMargin} [Frames = ${_docMarginStableFrames}]`);
      if (_docMarginStableFrames < 5) {
        requestAnimationFrame(stabilizeDocMargin);
      }
      else {
        _docMarginStableFrames = 0;
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 STABILIZE DOC MARGIN

  // #region 🟩 SET CORRECT LAYOUT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // listener callback is called whenever crossing the threshold or it can be called manually using 
  // 'setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);'
  function setCorrectLayout(e) {
    if (e.matches) { // viewport is now ≥768px
      setCorrectLayoutWide();
    } else { // viewport is now <768px
      setCorrectLayoutNarrow();
    }
    stabilizeDocMargin(); // stabilize the doc margin because sometimes it is not correct
  }

  // add listener (modern browsers)
  MEDIA_QUERY_WIN_WIDTH.addEventListener('change', setCorrectLayout);

  // if you need to support really old browsers:
  // MEDIA_QUERY_WIN_WIDTH.addListener(setCorrectLayout);

  async function setCorrectLayoutNarrow() {

    window.removeEventListener('resize', dualNavLayout);

    const sideNavP = waitFor('#side-nav');
    const priP = waitFor('#dp-pri-nav');
    const priResP = waitFor('#dp-pri-nav-resizer');
    const secP = waitFor('#dp-sec-nav');
    const secResP = waitFor('#dp-sec-nav-resizer');
    const [sideNav, pri, priRes, sec, secRes] = await Promise.all([sideNavP, priP, priResP, secP, secResP]);

    $(sideNav).hide();
    $(pri).hide();
    $(priRes).hide();
    $(sec).hide();
    $(secRes).hide();

    //console.log('Set Correct Layout - Narrow: SUCCESS');
  }

  async function setCorrectLayoutWide() {

    window.removeEventListener('resize', dualNavLayout);

    const sideNavP = waitFor('#side-nav');
    const priP = waitFor('#dp-pri-nav');
    const priResP = waitFor('#dp-pri-nav-resizer');
    const secP = waitFor('#dp-sec-nav');
    const secResP = waitFor('#dp-sec-nav-resizer');
    const [sideNav, pri, priRes, sec, secRes] = await Promise.all([sideNavP, priP, priResP, secP, secResP]);

    if (_dualNav) {

      $(sideNav).hide();

      $(pri).show();
      $(priRes).show();
      if (_secTree.length > 0) {
        $(sec).show();
        $(secRes).show();
      }
      else {
        $(sec).hide();
        $(secRes).hide();
      }

      window.addEventListener('resize', dualNavLayout);
      dualNavLayout();

      //console.log('Set Correct Layout - Wide: SUCCESS - Dual Nav');
    }
    else {
      $(pri).hide();
      $(priRes).hide();
      $(sec).hide();
      $(secRes).hide();
      $(sideNav).show();

      //console.log('Set Correct Layout - Wide: SUCCESS - Side Nav');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SET CORRECT LAYOUT

  // #region 🟩 ADJUST X AND H
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function adjustXandH() {
    const topP = waitFor('#top');
    const navP = waitFor('#side-nav');
    const docP = waitFor('#doc-content');
    const btmP = waitFor('#nav-path');
    const priP = waitFor('#dp-pri-nav');
    const priResP = waitFor('#dp-pri-nav-resizer');
    const secP = waitFor('#dp-sec-nav');
    const secResP = waitFor('#dp-sec-nav-resizer');
    const [top, nav, doc, btm, pri, priRes, sec, secRes] = await Promise.all([topP, navP, docP, btmP, priP, priResP, secP, secResP]);

    const hWin = window.innerHeight;
    const hBtm = btm.getBoundingClientRect().height;
    const xVal = top.getBoundingClientRect().height;
    const hVal = hWin - xVal - hBtm;
    const xTxt = xVal + 'px';
    const hTxt = hVal + 'px';

    pri.style.setProperty('top', xTxt, 'important');
    priRes.style.setProperty('top', xTxt, 'important');
    sec.style.setProperty('top', xTxt, 'important');
    secRes.style.setProperty('top', xTxt, 'important');

    nav.style.setProperty('height', hTxt, 'important');
    doc.style.setProperty('height', hTxt, 'important');
    pri.style.setProperty('height', hTxt, 'important');
    priRes.style.setProperty('height', hTxt, 'important');
    sec.style.setProperty('height', hTxt, 'important');
    secRes.style.setProperty('height', hTxt, 'important');

    //console.log(`Adjust X & H: X=${xTxt} & H=${hTxt}`);
  }

  async function adjustXandH_init() {

    // disconnect resize observer if it is not null
    if (_adjustXandH_resizeObserver) {
      _adjustXandH_resizeObserver.disconnect();
      _adjustXandH_resizeObserver = null;
    }

    // In IE11 or very old Safari (i.e. very old browsers) it might not have
    // ResizeObserver, in that case we fallback to resize with a timeout
    if ('ResizeObserver' in window) {
      const top = await waitFor('#top');
      _adjustXandH_resizeObserver = new ResizeObserver(entries => {
        adjustXandH(); // only one entry here is `top`, so no need to go thorugh all entries and checking of ids
      });
      _adjustXandH_resizeObserver.observe(top);
      //console.log('Adjust X & H - INIT: Resize Observer Connected');
    }
    else {
      window.addEventListener('resize', () => setTimeout(adjustXandH, 10));
      //console.log('Adjust X & H - INIT: Resize Observer not available in this browser, resize with timeout connected');
    }

    // Fire on window load once
    window.addEventListener('load', adjustXandH);

    //console.log('Adjust X & H - INIT: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 ADJUST X AND H

  // #region 🟩 BUILD TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function buildTree(primary = true) {

    const [tree, defExp, keyName, setExpCol] = primary
      ? [_priTree, false, KEY__PRI_NAV_EXPANDED_NODES, _priExpNodes]
      : [_secTree, true, HTML_NAME, _secColNodes];

    if (!Array.isArray(tree) || tree.length === 0) {
      const treeName = primary ? '_priTree' : '_secTree';
      console.log(`Build Tree: "${treeName}" is either not an array or is empty. Returning`);
      return;
    }

    const doSave = typeof keyName === 'string' && keyName.length > 0;
    if (doSave) {

    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 BUILD TREE

  // #region 🟩 URL ANCHOR HASH LISTNER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  window.addEventListener('hashchange', function (event) {
    // This function is called whenever the anchor part (i.e. tge hash part of ...html#...) in the URL changess
    if (_secTree.length > 0) {
      //setCurrentTreeItem('#dp-sec-nav .dp-tree-link', window.location.hash);
      urlHashChanged();
    }
  }, false);

  async function urlHashChanged() {
    //const sec = await waitFor('#dp-sec-nav');
    //setCurrentTreeItem(sec, true);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 URL ANCHOR HASH LISTNER

  // #region 🟩 DOCUMENT DOM LOADING CALLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


  const mainSet = new Set([1, 2]);
  const mainAry = [1, 2];
  console.log('BEFORE:', mainSet); // Set {1, 2}
  console.log('BEFORE:', mainAry); // [1, 2]

  function someFunc() {
    let tempSet = mainSet;
    let tempAry = mainAry;

    tempSet.add(3);
    tempAry.push(3);
  }

  someFunc();

  console.log('AFTER:', mainSet); // Set {1, 2, 3}
  console.log('AFTER:', mainAry); // [1, 2, 3]

  async function checkTimeout() {
    const start = performance.now();
    while (true) {
      const rem = performance.now() - start;
      if (rem > TIMEOUT) {
        console.log(`END: ${rem}`);
        break;
      }
      else {
        console.log(`RUN: ${rem}`);
        await new Promise(requestAnimationFrame);
      }
    }
  }

  async function docOnReady() {
    searchPlaceholderTweak();
    sideNavTweak();
    sidebarToggleButton();
    dualNavResizer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', docOnReady);
  } else {
    docOnReady();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DOCUMENT LOADING CALLS

})(jQuery);