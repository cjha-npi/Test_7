
/*
Prefix: dp-
File Names: doxy-plus.*
*/

// doxy-plus.js
// @ts-nocheck
/* global store, DOC_ROOT */

; (function ($) {
  'use strict';

  console.log('━━━━━━━━━━ FULL RELOAD ━━━━━━━━━━');

  // #region 🟩 CONSTANTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const KEY__DUAL_NAV = 'dual_nav'; // key by which dual nav or single nav data is stored in local storage
  const KEY__PRI_WIDTH = 'pri_width'; // key by which width of the primary pane of dual nav is stored in local storage
  const KEY__SEC_WIDTH = 'sec_width'; // key by which width of the secondary pane of dual nav is stored in local storage
  const KEY__GEN_DATA = 'gen_data'; // key by which the doxygen generation time is stored in session storage
  const KEY__PRI_TREE = 'pri_tree'; // key by which primary tree for dual nav is stored in session storage
  const KEY__MISSED_HTML_PAGES = 'missed_html_pages';
  const KEY__PRI_NAV_EXPANDED_NODES = 'pri_nav_expanded_nodes'; // key by which primary nav's already expanded nodes are stored in session storage

  // Constant Values
  const MAX_ATTEMPTS = 50; // Allowed max attempts for a rerun when something is not found in the initial run
  const ICON_SIDE_NAV = 'doxy-plus-side-nav.png'; // name for the icon that shows the default side nav symbol
  const ICON_DUAL_NAV = 'doxy-plus-dual-nav.png'; // name for the icon that shows the dual nav symbol
  const MIN_W = 25; // minimum width of either primary or secondary nav panes in dual nav configuration
  const GUTTER_W = 100; // right side gutter width in dual nav configuration
  const MEDIA_QUERY_WIN_WIDTH = window.matchMedia('(min-width: 768px)'); // a MediaQueryList for “min-width: 768px”, later used to set the correct layout
  const TIME_TO_LIVE = 10 * 60 * 1000; // 10 minutes, time for a storage variable to be considered stale. 7 * 24 * 60 * 60 * 1000 == 7 Days, 30 * 24 * 60 * 60 * 1000 == 30 Days
  const IS_HTML_END = /\.(?:xhtml|html)$/i; // case-insensitive check for a string ending in either .xhtml or .html

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

  let _consoleObjectName = '';
  let _dualNav = load(KEY__DUAL_NAV, true);
  let _priTree = [];
  let _missedHtmlPages = [];
  let _secTree = [];
  let _secTreeRemarks = '';
  let _wPri = loadNum(KEY__PRI_WIDTH, 250);
  let _wSec = loadNum(KEY__SEC_WIDTH, 250);
  let _priExpandedNodes = new Set();

  let _adjustXandH_resizeObserver = null;
  let _docMarginStableFrames = 0;

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

  function rerun(stepFn, attempt, ...args) {
    // Schedule the next animation frame up to MAX_ATTEMPTS,
    // passing along any extra arguments to stepFn.
    // ⚠️ The function should take first parameter as next attempt index
    // and then there can none or any number of parameters
    // Returns: The RAF ID, or null if you aborted.
    if (attempt < MAX_ATTEMPTS) {
      return requestAnimationFrame(() => stepFn(attempt + 1, ...args));
    }
    else {
      console.error(`${stepFn.name || 'callback'} [${attempt}]: Exceeded max attempts; aborting.`);
      return null;
    }
  }

  function waitFor(selector, timeout = 2000) {
    // Waits for the first element matching any CSS selector.
    // selector: Any valid querySelector string.
    // timeout: ms before rejecting (default 1 second).
    // Returns: Promise<Element>

    return new Promise((resolve, reject) => {
      // Immediate hit?
      const el = document.querySelector(selector);
      if (el) {
        //console.log(`Selector "${selector}" found immediately, no need for mutation observer`);
        return resolve(el);
      }

      // Otherwise observe mutations until we find one
      // In MutationObserver, first argument '_' is an
      // intentionally unused parameter, by using '_'
      // it means we are watching for any change. The
      // second argument 'observer' is the own 'obs'
      // instance.
      const obs = new MutationObserver((_, observer) => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          //console.log(`Selector "${selector}" found in mutation observer, Task Complete!`);
          resolve(found);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // Give up after timeout
      if (timeout > 0) {
        setTimeout(() => {
          obs.disconnect();
          reject(new Error(`Timed out waiting for selector "${selector}"`));
        }, timeout);
      }
    });
  }

  function waitForId(id, timeout = 2000) {
    // Waits for an element with the given ID.
    // id: The element’s id attribute (without the “#”).
    // timeout: ms before rejecting (default 1 second).
    // Returns: Promise<Element>

    // fast path
    const el = document.getElementById(id);
    if (el) {
      //console.log(`Element "#${id}" found immediately, no need for mutation observer`);
      return Promise.resolve(el);
    }
    // fall back to the generic waitFor
    return waitFor(`#${id}`, timeout);
  }

  function waitForClass(className, timeout = 2000) {
    // Waits for one or more elements with the given class.
    // className: The class name (without the “.”).
    // timeout: ms before rejecting (default 1 second).
    // Returns: Promise<Element[]> i.e. resolves with an array of matching elements

    return new Promise((resolve, reject) => {
      // fast path
      const initial = document.getElementsByClassName(className);
      if (initial.length) {
        return resolve(Array.from(initial));
      }

      // observe until we see at least one
      const obs = new MutationObserver((_, observer) => {
        const found = document.getElementsByClassName(className);
        if (found.length) {
          observer.disconnect();
          resolve(Array.from(found));
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // give up after timeout
      if (timeout > 0) {
        setTimeout(() => {
          obs.disconnect();
          reject(new Error(`Timed out waiting for class ".${className}"`));
        }, timeout);
      }
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

  function showToast(message, red = false, duration = 5000) {
    // 1) Get or create the container
    let container = document.getElementById('dp-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dp-toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: '9999'
      });
      document.body.appendChild(container);
    }

    // 2) Build the toast
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
      background: red ? 'rgba(150, 0, 0, 0.8)' : 'rgba(0,0,0,0.8)',
      color: 'white',
      fontSize: '12px',        // smaller text
      padding: '6px 12px',
      borderRadius: '6px',         // 6px radius
      marginTop: '8px',
      fontFamily: 'sans-serif',
      boxShadow: red ? '0 2px 6px rgba(150,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.4)',
      pointerEvents: 'auto',
      opacity: '0.6',         // very low default opacity
      transform: 'translateY(16px)',
      transition: 'opacity 0.2s ease, transform 0.3s ease'
    });
    container.appendChild(toast);

    // 3) Animate in to low opacity
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '0.6';
    });

    // 4) Set up dismissal logic with pause/resume
    let remaining = duration;
    let start = Date.now();
    let timeoutId;

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };

    const schedule = () => {
      start = Date.now();
      timeoutId = setTimeout(dismiss, remaining);
    };

    // begin the first timeout
    schedule();

    // 5) Hover handlers: pause on enter, resume on leave (at full opacity)
    toast.addEventListener('mouseenter', () => {
      clearTimeout(timeoutId);
      // subtract elapsed time
      remaining -= Date.now() - start;
      // bump opacity to full
      toast.style.opacity = '1';
    });

    toast.addEventListener('mouseleave', () => {
      // restore translucent state
      toast.style.opacity = '0.6';
      // schedule the remainder
      schedule();
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 HELPERS

  // #region 🟩 CONSOLE OBJECT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const consoleObject = Object.create(null); // main object

  // Project root location.
  // If the project is hosted on GitHub, the root is the origin URL plus the repository name; otherwise, it defaults to the local folder path on disk.
  Object.defineProperty(consoleObject, 'project_root', {
    get() {
      console.log(`Project root location: ${DOC_ROOT}\n\nIf the project is hosted on GitHub, the root is the origin URL plus the repository name; otherwise, it defaults to the local folder path on disk.`);
    },
    configurable: true
  });

  // Project storage namespace.
  // This namespace is used by store.js to store project data. By default, store.js uses the browser’s localStorage, which namespaces data by origin. As a result, projects sharing the same origin (e.g. some.com/proj_a and some.com/proj_b) will share the same storage. Likewise, projects loaded from different disk locations (e.g. D:/file/proj_a and E:/other/proj_b) also end up using the same localStorage.
  // To prevent one project’s data from overwriting another’s, we use store.js’s namespace feature. Assigning each project its own namespace ensures that data remains isolated and cannot conflict with other projects.
  Object.defineProperty(consoleObject, 'project_namespace', {
    get() {
      console.log(`Project Storage Namespace: ${PROJ_NAMESPACE}\n\nThis namespace is used by store.js to store project data. By default, store.js uses the browser's localStorage, which namespaces data by origin. As a result, projects sharing the same origin (e.g. some.com/proj_a and some.com/proj_b) will share the same storage. Likewise, projects loaded from different disk locations (e.g. D:/file/proj_a and E:/other/proj_b) also end up using the same localStorage.\n\nTo prevent one project's data from overwriting another's, we use store.js's namespace feature. Assigning each project its own namespace ensures that data remains isolated and cannot conflict with other projects.`);
    },
    configurable: true
  });

  // Clear all storage for this origin. Removes all data stored by any project under this origin.
  Object.defineProperty(consoleObject, 'storage_clear_all', {
    get() {
      localStorage.clear();
      sessionStorage.clear();
      console.log(`Storage Clear All: Done!`);
    },
    configurable: true
  });

  // Browser localStorage
  // Displays the current contents of the browser’s localStorage, including default entries and data from all projects. localStorage persists on disk indefinitely until explicitly cleared.
  // Project data saved via store.js includes an expiration and will be removed the next time it’s accessed (for example, when opening a project on the same origin). Entries written by store.js use a special signature, so their raw values may appear as “garbage”. To decode them correctly, always read through store.js using storage_origin (for all projects) or storage_project (for this project).
  Object.defineProperty(consoleObject, 'storage_local', {
    get() {
      console.group('● Storage Local Contents');
      const table = [];
      Object.keys(localStorage).forEach(fullKey => {
        table.push({
          Key: fullKey,
          Value: localStorage.getItem(fullKey)
        })
      });
      if (table.length > 0) {
        console.log(`Browser localStorage: Displays the current contents of the browser's localStorage, including default entries and data from all projects. localStorage persists on disk indefinitely until explicitly cleared. Project data saved via store.js includes an expiration and will be removed the next time it's accessed (for example, when opening a project on the same origin). Entries written by store.js use a special signature, so their raw values may appear as “garbage”. To decode them correctly, always read through store.js using ${_consoleObjectName}.storage_origin (for all projects) or ${_consoleObjectName}.storage_project (for this project).`)
        console.table(table);
      }
      else {
        console.log('Storage Local is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Browser sessionStorage
  // Displays the current contents of the browser’s sessionStorage, including default entries and data from all projects. Browser sessionStorage persists for the lifetime of the tab—surviving reloads but cleared when the tab is closed. store.js uses this as a fallback storage mechanism.
  Object.defineProperty(consoleObject, 'storage_session', {
    get() {
      console.group('● Storage Session Contents');
      const table = [];
      Object.keys(sessionStorage).forEach(fullKey => {
        table.push({
          Key: fullKey,
          Value: sessionStorage.getItem(fullKey)
        })
      });
      if (table.length > 0) {
        console.log(`Browser sessionStorage: Displays the current contents of the browser's sessionStorage, including default entries and data from all projects. Browser sessionStorage persists for the lifetime of the tab—surviving reloads but cleared when the tab is closed. store.js uses this as a fallback storage mechanism.`)
        console.table(table);
      }
      else {
        console.log('Storage Session is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Project's storage using store.js
  Object.defineProperty(consoleObject, 'storage_project', { // dp.storage_project
    get() {
      console.group('● Storage Project Contents');
      const table = [];
      const PRE = '__storejs___storejs_';
      const SEP = '_expire_mixin_';
      Object.keys(localStorage).forEach(fullKey => {
        if (fullKey.startsWith(PRE) && fullKey.indexOf(SEP, PRE.length) !== -1) {
          const rem = fullKey.slice(PRE.length);
          const [nsName, actualKey] = rem.split(SEP, 2);
          if (nsName === PROJ_NAMESPACE) {
            const expiresAt = STORAGE.getExpiration(actualKey);
            const isExpired = expiresAt != null && Date.now() > expiresAt;
            table.push({
              Namespace: PROJ_NAMESPACE,
              Key: actualKey,
              Value: STORAGE.get(actualKey),
              Validity: expiresAt
                ? new Date(expiresAt).toLocaleString()   // local date/time
                : null,
              Expired: isExpired
            });
          }
        }
      });
      if (table.length > 0) {
        console.table(table);
      }
      else {
        console.log('Storage Project is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // All Projects at this origin storage using store.js
  Object.defineProperty(consoleObject, 'storage_origin', { // dp.storage_origin
    get() {
      console.group('● Storage Origin Contents');
      const table = [];
      const PRE = '__storejs___storejs_';
      const SEP = '_expire_mixin_';
      Object.keys(localStorage).forEach(fullKey => {
        if (fullKey.startsWith(PRE) && fullKey.indexOf(SEP, PRE.length) !== -1) {
          const rem = fullKey.slice(PRE.length);
          const [nsName, actualkey] = rem.split(SEP, 2);
          const nsStore = store.namespace(nsName);
          const expiresAt = nsStore.getExpiration(actualkey);
          const isExpired = expiresAt != null && Date.now() > expiresAt;
          table.push({
            Namespace: nsName.length > 0 ? nsName : null,
            Key: actualkey,
            Value: nsStore.get(actualkey),
            Validity: expiresAt
              ? new Date(expiresAt).toLocaleString()   // local date/time
              : null,
            Expired: isExpired
          });
        }
      });
      if (table.length > 0) {
        console.table(table);
      }
      else {
        console.log('Storage Origin is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Primary nav tree (modified version of doxygen NAVTREE) in table format
  Object.defineProperty(consoleObject, 'navtree_default_table_format', { // dp.pri_tree_table_format
    get() {
      console.group('● Default Nav Tree');
      displayDefNavTree(false);
      console.groupEnd();
    },
    configurable: true
  });

  // Primary nav tree (modified version of doxygen NAVTREE) in group format
  Object.defineProperty(consoleObject, 'navtree_default_group_format', { // dp.pri_tree_group_format
    get() {
      console.group('● Default Nav Tree');
      displayDefNavTree(true);
      console.groupEnd();
    },
    configurable: true
  });

  // Primary nav tree (modified version of doxygen NAVTREE) in table format
  Object.defineProperty(consoleObject, 'primary_tree_table_format', { // dp.pri_tree_table_format
    get() {
      console.group('● Primary Nav Tree');
      if (_priTree.length > 0) {
        printTreeTableFormat(_priTree);
      }
      else {
        console.log('Primary Nav Tree is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Primary nav tree (modified version of doxygen NAVTREE) in group format
  Object.defineProperty(consoleObject, 'primary_tree_group_format', { // dp.pri_tree_group_format
    get() {
      console.group('● Primary Nav Tree');
      if (_priTree.length > 0) {
        printTreeGroupFormat(_priTree);
      }
      else {
        console.log('Primary Nav Tree is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Primary nav tree (modified version of doxygen NAVTREE) discarded data in table format
  Object.defineProperty(consoleObject, 'missed_html_pages', { // dp.pri_tree_discarded_table_format
    get() {
      console.group('● Missed HTML Pages List');
      if (_missedHtmlPages.length > 0) {
        console.table(_missedHtmlPages);
      }
      else {
        console.log('Missed HTML Pages List is EMPTY');
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Secondary tree (member signatures for class and struct) in table format
  Object.defineProperty(consoleObject, 'sec_tree_table_format', { // dp.sec_tree_table_format
    get() {
      console.group('● Secondary Tree');
      if (_secTree.length > 0) {
        printTreeTableFormat(_secTree);
      }
      else {
        console.log(`Secondary Tree is EMPTY: ${_secTreeRemarks}`);
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Secondary tree (member signatures for class and struct) in group format
  Object.defineProperty(consoleObject, 'sec_tree_group_format', { // dp.sec_tree_group_format
    get() {
      console.group('● Secondary Tree');
      if (_secTree.length > 0) {
        printTreeGroupFormat(_secTree);
      }
      else {
        console.log(`Secondary Tree is EMPTY: ${_secTreeRemarks}`);
      }
      console.groupEnd();
    },
    configurable: true
  });

  // Secondary tree (member signatures for class and struct) remarks
  Object.defineProperty(consoleObject, 'sec_tree_remarks', { // dp.sec_tree_remarks
    get() {
      console.log(`Secondary Tree Remarks: ${_secTreeRemarks}`);
    },
    configurable: true
  });

  // Displays the information
  Object.defineProperty(consoleObject, 'info', { // dp.info
    get() {
      console.group('● Doxy Plus Debug Information:');

      console.log(`● ${_consoleObjectName}.info\n\nThis information ouput`);

      console.log(`● ${_consoleObjectName}.project_root\n\nProject root location: If the project is hosted on GitHub, the root is the origin URL plus the repository name; otherwise, it defaults to the local folder path on disk.`);

      console.log(`● ${_consoleObjectName}.project_namespace\n\nProject storage namespace.\n\nThis namespace is used by store.js to store project data. By default, store.js uses the browser's localStorage, which namespaces data by origin. As a result, projects sharing the same origin (e.g. some.com/proj_a and some.com/proj_b) will share the same storage. Likewise, projects loaded from different disk locations (e.g. D:/file/proj_a and E:/other/proj_b) also end up using the same localStorage.\n\nTo prevent one project's data from overwriting another's, we use store.js's namespace feature. Assigning each project its own namespace ensures that data remains isolated and cannot conflict with other projects.`);

      console.log(`● ${_consoleObjectName}.storage_clear_all\n\nClear all storage for this origin. Removes all data stored by any project under this origin.`)

      console.log(`● ${_consoleObjectName}.storage_local\n\nBrowser localStorage.\n\nDisplays the current contents of the browser's localStorage, including default entries and data from all projects. localStorage persists on disk indefinitely until explicitly cleared.\n\nProject data saved via store.js includes an expiration and will be removed the next time it's accessed (for example, when opening a project on the same origin). Entries written by store.js use a special signature, so their raw values may appear as “garbage”. To decode them correctly, always read through store.js using:\n- ${_consoleObjectName}.storage_origin: All projects)\n- ${_consoleObjectName}.storage_project: This project`);

      console.log(`● ${_consoleObjectName}.storage_session\n\nBrowser sessionStorage\n\nDisplays the current contents of the browser's sessionStorage, including default entries and data from all projects. Browser sessionStorage persists for the lifetime of the tab—surviving reloads but cleared when the tab is closed.\n\nstore.js uses this as a fallback storage mechanism.`);

      console.log('● storage_project: Project storage using store.js');
      console.log('● storage_origin: All Projects at this origin storage using store.js');
      console.log('● pri_tree_table_format: Primary nav tree (modified version of doxygen NAVTREE) in table format');
      console.log('● pri_tree_group_format: Primary nav tree (modified version of doxygen NAVTREE) in group format');
      console.log('● pri_tree_discarded_table_format: Primary nav tree (modified version of doxygen NAVTREE) discarded data in table format');
      console.log('● pri_tree_discarded_group_format: Primary nav tree (modified version of doxygen NAVTREE) discarded data in group format');
      console.log('● sec_tree_table_format: Secondary tree (member signatures for class and struct) in table format');
      console.log('● sec_tree_group_format: Secondary tree (member signatures for class and struct) in group format');
      console.log('● sec_tree_remarks: Secondary tree (member signatures for class and struct) remarks');
      console.groupEnd();
    },
    configurable: true
  });

  // Assign "dp" as the object for window so that it can be used as debug handler in console
  // window.dp = Object.create(null); // if set below else will be executed. This is just for example
  if (window.dp !== undefined) {
    console.log('● Full Reload: "dp" already defined - "debugDoxyPlus" is the console debug handler');
    window.debugDoxyPlus = consoleObject;
    _consoleObjectName = 'debugDoxyPlus';
  }
  else {
    console.log('● Full Reload: "dp" is the console debug handler');
    window.dp = consoleObject;
    _consoleObjectName = 'dp';
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 CONSOLE OBJECT

  // #region 🟩 SEARCH PLACEHOLDER TWEAK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function searchPlaceholderTweak() {

    async function update() {
      const field = await waitFor('#MSearchField');
      if (!field || !window.searchBox || !window.indexSectionLabels) {
        console.error('Search Placeholder Tweak - Update: Required members are not available');
        return;
      }
      const label = window.indexSectionLabels[window.searchBox.searchIndex] || 'All';
      field.setAttribute('placeholder', `Search ${label}`);
      //console.log(`Search Placeholder Tweak - Update: SUCCESS "Search ${label}"`);
    }

    //await update(); // no need to call here, the window.searchBox.OnSelectItem is triggered automatically the first time

    // Run the update again when user changes the from search dropdown
    if (window.searchBox && window.searchBox.OnSelectItem && typeof window.searchBox.OnSelectItem === 'function') {
      const orig = window.searchBox.OnSelectItem;
      window.searchBox.OnSelectItem = function (id) {
        const ret = orig.call(this, id);
        //console.log('Search Placeholder Tweak - Search Box On Select Item Triggered');
        update();
        return ret;
      };
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
            setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);
            //console.log(`Sidebar Toggle Button - Click: DualNav = ${_dualNav}`);
          });

          itemSearchBox.appendChild(btn);
          //console.log('Sidebar Toggle Button - Setup: New Button');
        }
      }
      else {
        //console.log('Sidebar Toggle Button - Setup: Width < 768');
      }
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

  // #region 🟩 DEF NAVTREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genDefNavTree() {

    // helper to wait one animation frame
    const frame = () => new Promise(requestAnimationFrame);

    // wait until NAVTREE[0][2] exists and is a non-empty array
    while (
      !window.NAVTREE ||
      !Array.isArray(window.NAVTREE) ||
      window.NAVTREE.length === 0 ||
      !Array.isArray(window.NAVTREE[0]) ||
      window.NAVTREE[0].length < 3 ||
      !Array.isArray(window.NAVTREE[0][2])
    ) {
      console.log('Gen Def Nav Tree: Waiting for NAVTREE to be initialized…');
      await frame();
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
    return defTree;
  }

  async function displayDefNavTree(groupFormat = true) {
    const defNavTree = await genDefNavTree();
    if (defNavTree.length > 0) {
      if (groupFormat) {
        printTreeGroupFormat(defNavTree);
      }
      else {
        printTreeTableFormat(defNavTree);
      }
    }
    else {
      console.log('Default Nav Tree is EMPTY');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DEF NAVTREE

  // #region 🟩 GEN PRI TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genPriTree() {

    // setting the two array's lengths as 0 so that it is reinitialized
    // while maintaining previous links
    _priTree.length = 0;
    _missedHtmlPages.length = 0;

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
        _priTree = priTree;

        const missedHtmlPages = load(KEY__MISSED_HTML_PAGES);
        if (missedHtmlPages != null && Array.isArray(missedHtmlPages) && missedHtmlPages.length > 0) {
          _missedHtmlPages = missedHtmlPages;
          showToast(`Primary Tree has missed HTML pages. Look for '${_consoleObjectName}.missed_html_pages' in console for details`, true);
        }

        save(KEY__GEN_DATA, curDoxyTime);
        save(KEY__PRI_TREE, _priTree);
        save(KEY__MISSED_HTML_PAGES, _missedHtmlPages);

        //console.log(`Gen Pri Tree: Loaded from Session Storage`);
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

    const seenHtml = new Set();
    (function markSeen(tree) {
      if (!Array.isArray(tree) || tree.length === 0) return;
      for (const [, href, kids] of tree) {
        if (typeof href === 'string' && IS_HTML_END.test(href) && !seenHtml.has(href)) seenHtml.add(href);
        if (Array.isArray(kids)) markSeen(kids);
      }
    })(_priTree);

    const collected = new Set();
    (function collect(tree, parName = '') {
      if (!Array.isArray(tree) || tree.length === 0) return;
      for (const [name, href, kids] of tree) {
        const fullName = parName === '' ? name : parName + " → " + name;
        if (typeof href === 'string') {
          const link = href.replace(/(\.html)#.*$/, '$1');
          if (IS_HTML_END.test(link) && !seenHtml.has(link) && !collected.has(link)) {
            collected.add(link);
            _missedHtmlPages.push({ Name: fullName, Link: link });
          }
        }
        if (Array.isArray(kids)) {
          collect(kids, fullName);
        }
      }
    })(defTree);


    if (_missedHtmlPages.length > 0) {
      showToast(`Primary Tree has missed HTML pages. Look for '${_consoleObjectName}.missed_html_pages' in console for details`, true);
    }

    save(KEY__GEN_DATA, curDoxyTime);
    save(KEY__PRI_TREE, _priTree);
    save(KEY__MISSED_HTML_PAGES, _missedHtmlPages);

    //console.log(`Gen Pri Tree: Generated`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GEN PRI TREE

  // #region 🟩 GEN SEC TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function formatMemSigs(text) {
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
        let leafName = formatMemSigs(leafNameTemp);
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

  // #region 🟩 URL ANCHOR HASH LISTNER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  window.addEventListener('hashchange', function (event) {
    // This function is called whenever the anchor part (i.e. tge hash part of ...html#...) in the URL changess
    if (_secTree.length > 0) {
      //setCurrentTreeItem('#dp-sec-nav .dp-tree-link', window.location.hash);
      onHashChange();
    }
  }, false);

  async function onHashChange(){
    const sec = await waitFor('#dp-sec-nav');
    setCurrentTreeItem(sec, true);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 URL ANCHOR HASH LISTNER

  // #region 🟩 BUILD TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function buildTree(tree, defExpanded = false, keyExpCol = '', addRoot = false) {

    if (!Array.isArray(tree) || tree.length === 0) {
      console.log('Build Tree: Passed tree is either not an array or is empty. Returning');
      return;
    }

    const doSave = typeof keyExpCol === 'string' && keyExpCol.length > 0;
    let aryExpCol = [];
    if (doSave) {
      const rawExpCol = load(keyExpCol, []);
      if (Array.isArray(rawExpCol)) {
        aryExpCol = rawExpCol;
      }
      else {
        console.warn(`Build Tree: expected an array for "${keyExpCol}", got:`, rawExpCol);
      }
    }
    const setExpCol = new Set(aryExpCol);

    const curExpandableNodes = new Set();

    function builder(branch, level = []) {

      const list = document.createElement('ul');
      list.classList.add('dp-tree-list');

      branch.forEach(([name, path, kids], idx) => {

        const href = (typeof path === 'string' && path.length > 0) ? (addRoot ? DOC_ROOT + path : path) : null;

        const item = document.createElement('li');
        item.classList.add('dp-tree-item');
        const line = document.createElement('div');
        line.classList.add('dp-tree-line');
        const node = document.createElement('button');
        node.classList.add('dp-tree-node');
        const link = document.createElement('a');
        link.classList.add('dp-tree-link');

        line.append(node, link);
        item.appendChild(line);

        if (href) {
          link.href = href;
        } else {
          link.removeAttribute('href');
          link.setAttribute('aria-disabled', 'true');
          link.style.cursor = 'default';
          link.setAttribute('tabindex', '-1');
        }
        link.textContent = name;

        link.addEventListener('click', () => item.classList.add('dp-visited'));

        if (Array.isArray(kids) && kids.length > 0) {

          // build a stable ID: either the file base name, or the path of indices
          const thisLevel = [...level, idx];
          const fileBase = href
            ? path.split('/').pop().replace(/\..*$/, '')
            : null;
          const id = fileBase || thisLevel.join('.');

          item.classList.add('dp-has-children');
          curExpandableNodes.add(id);

          const isOpen = defExpanded ? !setExpCol.has(id) : setExpCol.has(id);
          node.textContent = isOpen ? '○' : '●';
          if (isOpen) {
            item.classList.add('dp-node-open');
          }

          node.addEventListener('click', e => {
            e.stopPropagation();
            const nowOpen = item.classList.toggle('dp-node-open');
            node.textContent = nowOpen ? '○' : '●';

            if (defExpanded) {
              nowOpen ? setExpCol.delete(id) : setExpCol.add(id);
            }
            else {
              nowOpen ? setExpCol.add(id) : setExpCol.delete(id);
            }

            if (doSave) {
              save(keyExpCol, Array.from(setExpCol));
            }
          });

          item.appendChild(builder(kids, thisLevel));
        }
        else {
          node.style.visibility = 'hidden';
        }

        list.appendChild(item);
      });

      return list;
    }

    const built = builder(tree);

    // Prune any IDs no longer present
    for (const id of [...setExpCol]) {
      if (!curExpandableNodes.has(id)) {
        setExpCol.delete(id);
      }
    }

    if (doSave) {
      save(keyExpCol, Array.from(setExpCol));
    }

    return built;
  }

  function setCurrentTreeItem(container, useHash = false) {

    const prev = container.querySelector('.dp-current');
    if (prev) {
      prev.classList.remove('dp-current');
    }

    const target = useHash ? window.location.hash : window.location.pathname;
    if (!target) return;

    console.log('----', useHash, target);

    const links = container.querySelectorAll('.dp-tree-link[href]');
    for (const link of links) {
        console.log('--', useHash, link.getAttribute('href'));
      if (link.getAttribute('href') === target) {


        // 3. mark the new current item
        const item = link.closest('.dp-tree-item');
        item.classList.add('dp-current');

        // 4. expand all ancestor nodes
        let parentItem = item.parentElement.closest('.dp-tree-item');
        while (parentItem) {
          parentItem.classList.add('dp-node-open');
          const btn = parentItem.querySelector(':scope > .dp-tree-line > .dp-tree-node');
          if (btn) btn.textContent = '○';
          parentItem = parentItem.parentElement.closest('.dp-tree-item');
        }

        // 5. scroll it into view
        item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }
    }
  }

  async function buildTree_init() {
    const [pri, sec] = await Promise.all([waitFor('#dp-pri-nav'), waitFor('#dp-sec-nav')]);
    pri.innerHTML = '';
    pri.appendChild(buildTree(_priTree, false, KEY__PRI_NAV_EXPANDED_NODES, true));
    setCurrentTreeItem(pri, false);
    if (_secTree.length > 0) {
      sec.innerHTML = '';
      sec.appendChild(buildTree(_secTree, true, HTML_NAME, false));
      setCurrentTreeItem(sec, true);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 BUILD TREE

  // #region 🟩 DOCUMENT DOM LOADING CALLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function docOnReady() {
    searchPlaceholderTweak();
    sideNavTweak();
    sidebarToggleButton();
    dualNavResizer();
    await genPriTree();
    await genSecTree();
    setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);
    adjustXandH_init();
    buildTree_init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', docOnReady);
  } else {
    docOnReady();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DOCUMENT LOADING CALLS

})(jQuery);