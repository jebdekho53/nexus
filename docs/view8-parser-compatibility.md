# View8 parser compatibility diagnosis

Verified locally on17October2026 IST. This was static parser inspection; no shipped application, live account, browser login, booking or payment was executed.

## Result

The installed upstream parser under `../tools-view8-suleram/View8` reproduces `Incomplete parsing of function: func_unknown`. The failing object has no argument count, register count, constant pool or code. This is a concrete dump-format/parser mismatch, not evidence that V8 must be downgraded or rebuilt.

The input is an already successful V8 15.0.245.31 Electron ia32 disassembly. Its functions are emitted as separate SharedFunctionInfo blocks; constant-pool SharedFunctionInfo entries can refer to a function printed later. The upstream parser treats those references as nested function bodies and recursively consumes subsequent parent lines. The local adapted jsc2js parser handles flat function references and modern dump syntax.

Upstream README lists bundled raw-bytecode disassembler builds for V8 9.4–11.3. Those bundled executables are a separate issue from parsing an already-disassembled text file. Merely changing version labels or suppressing the incomplete-function exception would not recover the missing function data.

## Existing compatible route

Use `../recovery-tools/jsc2js-main/View8/view8.py`, not the upstream copy, for this dump. It is already installed locally and was used by the earlier recovery pipeline. Its CLI differs from upstream:

```powershell
$matrixPython = 'C:\Users\gurpr\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$matrixRecoveryRoot = 'C:\Users\gurpr\OneDrive\Documents\ts'
$matrixOldPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = "$matrixRecoveryRoot\recovery-tools\python-deps"
    & $matrixPython "$matrixRecoveryRoot\recovery-tools\jsc2js-main\View8\view8.py" `
        --disassembled `
        "$matrixRecoveryRoot\recovered-source\main-reconstruction\index.decoded.disassembly.txt" `
        "$matrixRecoveryRoot\view8-output\index.compatible-candidate.js"
    if ($LASTEXITCODE -ne 0) { throw 'Compatible View8 export failed; inspect its diagnostics.' }
} finally {
    $env:PYTHONPATH = $matrixOldPythonPath
}
```

The export command is supplied for a separate isolated candidate output; it was not rerun as part of this parser-only diagnosis. Do not overwrite the verified ordinary-JavaScript modules or regenerate the app from this candidate without behavioral comparisons.

## Verified parser evidence

Fresh adapted-parser run against `index.decoded.disassembly.txt`:

- 4,354 functions, all with nonempty instruction streams.
- 512,857 actual instruction rows, matching the existing recovered-function inventory.
- No parser diagnostic output in the captured log.
- 893,857 additional rows are parser byte-offset padding; they must not be counted as actual recovered instructions.

Machine-readable evidence: `../view8-output/adapted-parser-check.json` and `../view8-output/adapted-parser-check.log`, relative to the repository root. The input and fork remain outside this Git checkout; another machine needs those recovery assets separately.

## Limits and next action

The adapted parser normalizes missing data and pads byte offsets. The matching function/instruction totals establish parsing coverage, not control-flow correctness, exact constant semantics or runnable source. Earlier generated readable output has known branch/scope reconstruction limitations. Keep actual recovered-oracle comparisons as the verification gate.

Next compare representative small, async and branching function exports with the already verified native implementations before using this tool for batch migration. No installation, V8 rebuild, production change or interpreter removal was needed for this diagnosis.
