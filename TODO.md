* I'd like implicit output to be in a different color.  Possibly configurable?  That would require a WebView or Terminal.
* I'd like error output to show in a different color.
* Custom intrinsics: "vscode.log(text)", "vscode.workspaceRoot"
* Execution options: timeout, step limit
* Debugger protocol???

* Split message handling into a MiniScriptProtocol class
* Track execution state (running / finished)
* Add cancellation support (child.kill())
* Add compile-time diagnostics (before RunUntilDone)
* Introduce severity levels from MiniScript
* Decide whether implicit output should be suppressible via settings
