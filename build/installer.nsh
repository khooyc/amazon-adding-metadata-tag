!ifndef BUILD_UNINSTALLER
  !include "MUI2.nsh"

  Var CreateStartMenuShortcutCheckbox
  Var CreateStartMenuShortcut

  !macro customInit
    StrCpy $CreateStartMenuShortcut ${BST_CHECKED}
  !macroend

  Function StartMenuShortcutPageCreate
    ${If} ${Silent}
      Abort
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "Start Menu shortcut" "Choose whether to add the app to your Start Menu."
    ${NSD_CreateCheckbox} 0 24u 100% 12u "Create a Start Menu shortcut"
    Pop $CreateStartMenuShortcutCheckbox
    ${NSD_SetState} $CreateStartMenuShortcutCheckbox $CreateStartMenuShortcut

    nsDialogs::Show
  FunctionEnd

  Function StartMenuShortcutPageLeave
    ${NSD_GetState} $CreateStartMenuShortcutCheckbox $CreateStartMenuShortcut
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom StartMenuShortcutPageCreate StartMenuShortcutPageLeave
  !macroend

  !macro customInstall
    ${If} $CreateStartMenuShortcut != ${BST_CHECKED}
      WinShell::UninstShortcut "$newStartMenuLink"
      Delete "$newStartMenuLink"
      StrCpy $launchLink "$appExe"
    ${Else}
      ${IfNot} ${Silent}
        ${IfNot} ${FileExists} "$newStartMenuLink"
          !insertmacro createMenuDirectory
          CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  !macroend
!endif
