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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Pattern 1: standalone period on a line
    if (trimmed === ".") {
      report("STANDALONE_DOT", filePath, lineNum, trimmed);
    }

    // Pattern 2: period after closing JSX tag  </Tag>.
    if (/<\/\w+>\s*\./.test(line)) {
      report("DOT_AFTER_CLOSE_TAG", filePath, lineNum, trimmed);
    }

    // Pattern 3: period after self-closing tag  />.
    if (/\/>\s*\./.test(line)) {
      report("DOT_AFTER_SELF_CLOSE", filePath, lineNum, trimmed);
    }

    // Pattern 4: period after closing brace  }.  (JSX expression end)
    if (
      /\}\s*\.\s*$/.test(line) &&
      !/^\s*\/\//.test(line) &&
      !/^\s*\*/.test(line)
    ) {
      // Exclude JS code patterns
      if (
        !/const |let |var |import |function |=>|return |export |async /.test(
          line,
        )
      ) {
        report("DOT_AFTER_BRACE", filePath, lineNum, trimmed);
      }
    }

    // Pattern 5: period between closing and opening tags  >.<  or  > . <
    if (/>\s*\.\s*</.test(line) && !/^\s*\/\//.test(line)) {
      report("DOT_BETWEEN_TAGS", filePath, lineNum, trimmed);
    }

    // Pattern 6: period after closing paren  ).  in JSX context (not method chaining)
    if (
      /\)\s*\.\s*$/.test(line) &&
      !/^\s*\/\//.test(line) &&
      !/\w\s*\)\s*\./.test(line)
    ) {
      report("DOT_AFTER_PAREN", filePath, lineNum, trimmed);
    }

    // Pattern 7: Conditional rendering with just a dot string
    if (/&&\s*["']\.["']/.test(line) || /\?\s*["']\.["']/.test(line)) {
      report("CONDITIONAL_DOT_STRING", filePath, lineNum, trimmed);
    }

    // Pattern 8: JSX expression that's just a dot  {"."}  or  {'.'}
    if (/\{\s*["']\.["']\s*\}/.test(line)) {
      report("JSX_DOT_EXPRESSION", filePath, lineNum, trimmed);
    }

    // Pattern 9: A period that follows a JSX expression closer on next line
    if (trimmed === "." && i > 0) {
      const prevLine = lines[i - 1].trim();
      if (
        prevLine.endsWith("}") ||
        prevLine.endsWith("/>") ||
        prevLine.endsWith(">")
      ) {
        report(
          "DOT_ON_NEXT_LINE_AFTER_JSX",
          filePath,
          lineNum,
          `prev: "${prevLine}" | current: "${trimmed}"`,
        );
      }
    }

    // Pattern 10: Text with trailing period rendered outside Text component
    // Look for lines with just text ending in period that could be JSX content
    if (
      /^\s*[A-Za-zА-Яа-яЁё].*\.\s*$/.test(line) &&
      !/^\s*\/\//.test(line) &&
      !/^\s*\*/.test(line)
    ) {
      // Check if it looks like JSX content (not JS code)
      if (
        !/import |const |let |var |function |return |export |if |else |while |for |switch |case |break |throw |new |typeof |instanceof /.test(
          line,
        ) &&
        !/=/.test(line) &&
        !/\(/.test(line) &&
        !/:/.test(line) &&
        !/=>/.test(line)
      ) {
        report("POSSIBLE_TEXT_CONTENT", filePath, lineNum, trimmed);
      }
    }
  }

  // Multi-line pattern: look for period between > and < across lines
  const multiLineRegex = />\s*\n\s*\.\s*\n\s*</g;
  let match;
  while ((match = multiLineRegex.exec(content)) !== null) {
    const before = content.substring(0, match.index);
    const lineNum = before.split("\n").length;
    report(
      "MULTILINE_DOT_BETWEEN_TAGS",
      filePath,
      lineNum,
      match[0].replace(/\n/g, "\\n"),
    );
  }

  // Multi-line pattern: period on its own between JSX elements
  const regex2 = /\/>\s*\n\s*\.\s*\n/g;
  while ((match = regex2.exec(content)) !== null) {
    const before = content.substring(0, match.index);
    const lineNum = before.split("\n").length;
    report("MULTILINE_DOT_AFTER_SELFCLOSE", filePath, lineNum + 1, ".");
  }
}

function report(pattern, filePath, lineNum, content) {
  console.log(`[${pattern}] ${filePath}:${lineNum}: ${content}`);
}

const baseDir = path.resolve(__dirname);
scanDir(path.join(baseDir, "app"));
scanDir(path.join(baseDir, "components"));
console.log("=== SCAN COMPLETE ===");
