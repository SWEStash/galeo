; Generated from scripts/lib/associations.mjs by windowsAssociationsNsh(); a unit test keeps them equal.
; Adds galeo to the "Open with" list of the types it reads. Never sets a type's default app.
; The uninstall also removes the `galeo` command Settings installed, while it is galeo's.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\galeo.document" "" "galeo document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\galeo.document\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\galeo.document\shell\open\command" "" `"$appExe" -- "%1"`
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe" "FriendlyAppName" "galeo"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\shell\open\command" "" `"$appExe" -- "%1"`
  WriteRegNone SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".md" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".markdown" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.mdx\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".mdx" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.txt\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".txt" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.log\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".log" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.json\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".json" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.jsonl\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".jsonl" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.ndjson\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".ndjson" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.yaml\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".yaml" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.yml\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".yml" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.toml\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".toml" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.csv\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".csv" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.psv\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".psv" ""
  WriteRegNone SHELL_CONTEXT "Software\Classes\.tsv\OpenWithProgids" "galeo.document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\galeo.exe\SupportedTypes" ".tsv" ""
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.mdx\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.txt\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.log\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.json\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.jsonl\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.ndjson\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.yaml\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.yml\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.toml\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.csv\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.psv\OpenWithProgids" "galeo.document"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.tsv\OpenWithProgids" "galeo.document"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\galeo.document"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\galeo.exe"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
  ; The `galeo` command, only while its second line is galeo's mark; an update keeps it.
  ${IfNot} ${isUpdated}
    Push $0
    Push $1
    ClearErrors
    FileOpen $0 "$LOCALAPPDATA\Microsoft\WindowsApps\galeo.cmd" r
    ${IfNot} ${Errors}
      FileRead $0 $1
      FileRead $0 $1
      FileClose $0
      ${If} $1 S== "rem Installed by galeo: the command-line launcher for its app.$\r$\n"
        Delete "$LOCALAPPDATA\Microsoft\WindowsApps\galeo.cmd"
      ${EndIf}
    ${EndIf}
    Pop $1
    Pop $0
  ${EndIf}
!macroend
