const fs = require("fs");
const path = require("path");

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.name.endsWith(".tsx")) {
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  // Track if we're inside return/JSX context and what parent element we're in
  let inReturn = false;
  let braceDepth = 0;
  let parenDepth = 0;

  // Stack of parent elements - track View vs Text
  // We'll track the component stack
  const tagStack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip comments
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    )
      continue;

    // Track return statements for JSX context
    if (/return\s*\(/.test(line)) inReturn = true;

    if (!inReturn) continue;

    // Look for any character that could be a text node (period specifically)
    // This checks if a period appears outside of:
    // - JSX attributes (inside <Tag prop="...">)
    // - JSX expressions (inside {...})
    // - Method chains (like something.method())
    // - String literals

    // Simple heuristic: look for period that's between JSX elements
    // Check if line has a period but is not inside a tag definition, string, or JS expression

    // Pattern: line contains only period (possibly with whitespace)
    if (/^\s*\.\s*$/.test(line)) {
      console.log(`[BARE_DOT] ${filePath}:${lineNum}: "${trimmed}"`);
    }

    // Pattern: period after a JSX closing expression on same line
    // e.g., {expression}. or  />. or </Tag>.
    const periodAfterJSX = line.match(/(?:\}|<\/\w+>|\/\s*>)\s*(\.)\s*(?:$|<)/);
    if (periodAfterJSX) {
      // Make sure it's not JS code
      if (!/const|let|var|import|function|=>|return|export/.test(line)) {
        console.log(`[DOT_AFTER_JSX] ${filePath}:${lineNum}: "${trimmed}"`);
      }
    }
  }

  // NEW: Multi-line analysis - look for text between > and < across lines
  // Find all locations where we have > some_text < and check if some_text contains just a period
  const regex = />([^<]*)</g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const textContent = match[1].trim();
    if (textContent === ".") {
      const before = content.substring(0, match.index);
      const lineNum = before.split("\n").length;
      const lineContent = lines[lineNum - 1].trim();

      // Check what tag this is inside
      // Look backwards for the opening tag
      const beforeText = content.substring(
        Math.max(0, match.index - 200),
        match.index,
      );
      const tagMatch = beforeText.match(/<(\w+)[^>]*>\s*$/);
      const parentTag = tagMatch ? tagMatch[1] : "unknown";

      console.log(
        `[TEXT_DOT_IN_${parentTag.toUpperCase()}] ${filePath}:${lineNum}: "${lineContent}" (parent: <${parentTag}>)`,
      );
    }
  }

  // Also look for text nodes with periods in JSX expressions
  // Pattern: {  ".something"  } where the result is a period rendered
  // Or {condition && "."}
  const exprRegex = /\{[^}]*["']\.["'][^}]*\}/g;
  while ((match = exprRegex.exec(content)) !== null) {
    const before = content.substring(0, match.index);
    const lineNum = before.split("\n").length;
    const lineContent = lines[lineNum - 1].trim();
    // Check context - is this inside a View?
    if (
      !/split|replace|match|test|indexOf|includes|startsWith|endsWith|slice/.test(
        match[0],
      )
    ) {
      console.log(
        `[EXPR_WITH_DOT] ${filePath}:${lineNum}: "${lineContent}" expr: ${match[0]}`,
      );
    }
  }
}

const baseDir = path.resolve(__dirname);
scanDir(path.join(baseDir, "app"));
scanDir(path.join(baseDir, "components"));
console.log("=== ADVANCED SCAN COMPLETE ===");
