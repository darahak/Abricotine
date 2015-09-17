// Wrapper CodeMirror
// C'est ici qu'on a les fonctions ital, bold, etc.
// Most of the methods are aliases to CodeMirror functions

var md4cm = loadComponent('md4cm'),
    celldown = require("celldown.js");

function AbrEditor (abrDocument) {
    function addTrailingWhitespace (cm) {
        cm.addOverlay({
            token: function(stream) {
                if (stream.match(/^\s\s+$/)) {
                    return "trailing-whitespace";
                }
                stream.match(/^\s*\S*/);
                return null;
            }
        });
    }
    function notBlankLines (cm) {
        cm.addOverlay({
            token: function(stream) {
                stream.match(/^\s*\S*/);
                return "line-not-blank";
            }
        });
    }

    // Ignore content into $$ delimiters (inline MathJax)
    // FIXME: This is dirty. We lose highlight until the end of the line. I should rewrite the markdown mode instead.
    CodeMirror.defineMode("abricotine", function(config) {
        return CodeMirror.multiplexingMode(
            CodeMirror.getMode(config, "gfm"),
            {open: "$$", close: "\n",
             mode: CodeMirror.getMode(config, "text/plain")}
            // .. more multiplexed styles can follow here
        );
    });

    // Additional moves
    var goParagraph = function (direction, cm) {
        if (direction !== "up" && direction !== "down") {
            return;
        }
        var currentPos = cm.doc.getCursor(),
            currentParagraph = cm.abrEditor.getParagraphCoord(currentPos),
            line = currentParagraph ? (direction === "up" ? currentParagraph.from : currentParagraph.to) : currentPos.line,
            paragraphToGo = false,
            nextPos = {
                line: line,
                ch: 0
            };
        while (paragraphToGo === false &&
            (
                (direction === "up" && line > cm.doc.firstLine()) ||
                (direction === "down" && line < cm.doc.lastLine())
            )) {
            line += direction === "up" ? -1 : 1;
            paragraphToGo = cm.abrEditor.getParagraphCoord(line);
        }
        if (paragraphToGo !== false) {
            nextPos.line = paragraphToGo.from;
        }
        cm.doc.setCursor(nextPos);
    };
    CodeMirror.commands.goPrevParagraph = function (cm) {
        goParagraph("up", cm);
    };
    CodeMirror.commands.goNextParagraph = function (cm) {
        goParagraph("down", cm);
    };
    var that = this,
        options= {
            lineNumbers: false,
            lineWrapping: true,
            styleActiveLine: true, // Focusmode
            autofocus: true,
            autoCloseBrackets: typeof Abricotine.config.autoCloseBrackets !== "undefined" ? Abricotine.config.autoCloseBrackets : false, // TODO: config: donner la possibilité de toggle
            scrollbarStyle: "overlay",
            mode: "abricotine",
            extraKeys: {
                "Enter": "newlineAndIndentContinueMarkdownList",
                "Home": "goLineLeft",
                "End": "goLineRight",
                "Ctrl-Up": "goPrevParagraph",
                "Ctrl-Down": "goNextParagraph"
            }
        }; // FIXME: replace default keymap by a custom one which removes most of hotkeys (CodeMirror interferences with menu accelerators)
    this.cm = CodeMirror.fromTextArea(document.getElementById("cm"), options);
    this.cm.abrEditor = this;
    addTrailingWhitespace(this.cm);
    // notBlankLines(this.cm); // TODO: remove this function if unused
    this.setClean();
    this.abrDocument = abrDocument;

    // Events
    // Cursorspy (like scrollspy but with cursor)
    var spyCursor = function () {
        var currentLine = that.cm.doc.getCursor().line,
            $prevHeaderLi = (function(line) {
                var $header;
                $("#toc-container li").each(function() {
                    var linkedLine = $(this).attr("data-abricotine-gotoline");
                    if (linkedLine !== undefined && linkedLine <= line) {
                        $header = $(this);
                    } else {
                        return false; // break
                    }
                });
                return $header;
            })(currentLine);
        if ($prevHeaderLi && !$prevHeaderLi.hasClass("uk-active")) {
            $("#toc-container li.uk-active").removeClass("uk-active");
            $prevHeaderLi.addClass("uk-active");
            // TODO: auto scroll to $prevHeaderLi if hidden in pane
        }
        that.latestSpyCursorUpdate = that.getGeneration();
    };
    this.cm.on("cursorActivity", function (cm) {
        // Inline preview
        var previewInLine = loadComponent("previewInLine"); // TODO: to clean
        that.cm.doc.eachLine( function (line) {
            previewInLine(that.cm, line, ["image", "checkbox", "iframe", "anchor", "math"]);
        });
        // Trigger spyCursor() now only if nothing changed (otherwise do it later, during changes event)
        if (typeof that.latestSpyCursorUpdate === "undefined" || that.getGeneration() === that.latestSpyCursorUpdate) {
            spyCursor();
        }
    });
    this.cm.on("changes", function (cm, changeObj) {
        that.abrDocument.updateWindowTitle();
        that.updateToc();
        spyCursor();
    });
}

AbrEditor.prototype.toggle = function (type) {
    md4cm.toggle(type)(this.cm);
};

AbrEditor.prototype.draw = function (type, param) {
    md4cm.draw(type, param)(this.cm);
};

AbrEditor.prototype.getStateAt = function (pos) {
    return md4cm.getState(this.cm, pos);
};

AbrEditor.prototype.getData = function () {
    return this.cm.doc.getValue();
};

AbrEditor.prototype.setData = function (data) {
    return this.cm.doc.setValue(data); // TODO: return ?
};

AbrEditor.prototype.clearData = function () {
    return this.cm.doc.setValue(""); // TODO: return ?
};

AbrEditor.prototype.isClean = function () {
    return this.cm.doc.isClean(this.latestGeneration);
};

AbrEditor.prototype.getGeneration = function () {
    return this.cm.doc.changeGeneration();
};

AbrEditor.prototype.setClean = function () {
    this.latestGeneration = this.getGeneration();
};

AbrEditor.prototype.execCommand = function (cmd) {
    this.cm.execCommand(cmd);
};

AbrEditor.prototype.getMarkers = function (selector) {
    var doc = this.cm.doc,
        markers = doc.getAllMarks(),
        collection = [],
        element;
    if (!selector) {
        return markers;
    }
    for (var i=0; i<markers.length; i++) {
        element = markers[i].replacedWith;
        if (element.matches(selector)) {
            collection.push(markers[i]);
        }
    }
    return collection;
};

AbrEditor.prototype.clearMarkers = function (selector) {
    var doc = this.cm.doc,
        markers = this.getMarkers(selector);
    for (var i=0; i<markers.length; i++) {
        markers[i].clear();
    }
};

// Returns false if line is blank or a {from: lineNumber, to: lineNumber} object otherwise
AbrEditor.prototype.getParagraphCoord = function (posOrLine) {
    function isEmptyLine (lineNumber) {
        return doc.getLine(lineNumber).trim() === "";
    }
    function getBoundary (lineNumber, step) {
        var i = lineNumber,
            min = doc.firstLine(),
            max = doc.lastLine();
        step = step < 0 ? step = -1 : step = 1;
        while (i >= min && i<= max) {
            if (isEmptyLine(i)) {
                return i - step;
            }
            i += step;
        }
        return step === -1 ? min : max;
    }
    var doc = this.cm.doc,
        lineNumber;
    if (typeof posOrLine === "object" && posOrLine.line) {
        lineNumber = posOrLine.line;
    } else if (typeof posOrLine === "number") {
        lineNumber = posOrLine;
    } else {
        lineNumber = doc.getCursor().line;
    }
    return isEmptyLine(lineNumber) ? false : {
        from: getBoundary(lineNumber, -1),
        to: getBoundary(lineNumber, 1)
    };
};

AbrEditor.prototype.getParagraphContent = function (arg) {
    var coord = arg.from && arg.to ? arg : this.getParagraphCoord(arg);
    return this.cm.doc.getRange(
        // from
        {
            line: coord.from,
            ch: 0
        },
        // to
        {
            line: coord.to,
            ch: null
        }
    );
};

AbrEditor.prototype.updateToc = function () {
    var that = this,
        toc = [],
        prevLine;
    this.cm.doc.eachLine( function (line) {
        var lineNumber = that.cm.doc.getLineNumber(line),
            state = that.getStateAt({line: lineNumber, ch: 1});
        if (state.header) {
            // Handle underlined headers. TODO: fix header preview in CodeMirror
            if ((state.h1 || state.h2) && /^(=|-)+$/.test(line.text.trim())) {
                toc.push ({
                    content: prevLine.text,
                    level: state.header,
                    line: lineNumber - 1
                });
            } else {
                var text = line.text.match(/^#+\s(.*)$/);
                text = text && text[1] ? text[1] : line.text;
                toc.push ({
                    content: text,
                    level: state.header,
                    line: lineNumber
                });
            }
        }
        prevLine = line;
    });
    Abricotine.setTocHtml(toc);
};

// Tables

AbrEditor.prototype.tableCreate = function (cols, rows) {
    cols = cols || 2;
    rows = rows || 1;
    var doc = this.cm.doc,
        table = celldown.new(cols, rows).get().table,
        cursorPos = doc.getCursor(),
        // CodeMirror's getCursor() returns a reference to cursor object, so we need to copy it before writing in it otherwise it would confuse CM for the next operations
        newCursorPos = {
            line: cursorPos.line,
            ch: cursorPos.ch
        },
        lineContent = doc.getLine(cursorPos.line);
    // Manage spaces before and after the table
    if (lineContent.trim() === "") {
        doc.replaceRange("", {line: cursorPos.line, ch: 0}, {line: cursorPos.line, ch: null});
        if (cursorPos.line !== doc.firstLine() && doc.getLine(cursorPos.line-1).trim() !== "") {
            table = "\n" + table;
        }
        if (cursorPos.line !== doc.lastLine() && doc.getLine(cursorPos.line+1).trim() !== "") {
            table = table + "\n";
        }
    } else {
        table = "\n\n" + table + "\n\n";
        newCursorPos.line += 2;
    }
    // Move cursor in the first cell
    newCursorPos.ch = 0;
    if (celldown.config.extraPipes) {
        newCursorPos.ch += 1;
    }
    if (celldown.config.extraSpaces) {
        newCursorPos.ch += 1;
    }
    // Inject table
    doc.replaceSelection(table);
    doc.setCursor(newCursorPos);
};

AbrEditor.prototype.paragraphIsTable = function (arg) {
    var p = this.getParagraphContent(arg);
    return ;
};

AbrEditor.prototype.tableGet = function () {
    var cm = this.cm,
        pCoord = this.getParagraphCoord(),
        pContent = this.getParagraphContent(pCoord);
    if (!celldown.isValidTable(pContent)) {
        return null;
    }
    var cursor = cm.doc.getCursor();
    if (cursor.line >= pCoord.from && cursor.line <= pCoord.to) {
        cursor.line -= pCoord.from;
    } else {
        cursor = null;
    }
    var table = celldown.fromText(pContent, cursor);
    // Add a custom abrParagraph property to store table location in editor
    table.abrParagraph = pCoord;
    return table;
};

AbrEditor.prototype.tableInject = function (table) {
    var cm = this.cm,
        pCoord = table.abrParagraph,
        t = table.beautify().get(),
        text = t.table,
        relativeCursor = t.cursor;
    cm.replaceRange(text,
        // from
        {
            line: pCoord.from,
            ch: 0
        },
        // to
        {
            line: pCoord.to,
            ch: null
        }
    );
    if (relativeCursor) {
        var cursor = {
            line: relativeCursor.line + pCoord.from,
            ch: relativeCursor.ch
        };
        cm.doc.setCursor(cursor);
    }
};

AbrEditor.prototype.tableDo = function (action) {
    var args = [],
        table = this.tableGet();
    if (!table) {
        console.log("No markdown table found in text"); // TODO: celldown should have an option for automatically converting text into table when string is not a valid markdown table
        return;
    }
    if (!table[action] || typeof table[action] !== "function") {
        console.error("'" + action + "' is not a valid Table (celldown.js) method");
        return;
    }
    for (var i = 1; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    table[action].apply(table, args);
    this.tableInject(table);
};

module.exports = AbrEditor;
