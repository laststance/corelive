; Custom NSIS installer script for CoreLive TODO
; Registers the corelive-todo:// URL scheme

!macro customInstall
  ; Register URL scheme for current user
  WriteRegStr HKCU "SOFTWARE\Classes\corelive-todo" "" "URL:CoreLive TODO Protocol"
  WriteRegStr HKCU "SOFTWARE\Classes\corelive-todo" "URL Protocol" ""
  WriteRegStr HKCU "SOFTWARE\Classes\corelive-todo\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "SOFTWARE\Classes\corelive-todo\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Also register for all users if admin
  ${If} ${UAC_IsAdmin}
    WriteRegStr HKCR "corelive-todo" "" "URL:CoreLive TODO Protocol"
    WriteRegStr HKCR "corelive-todo" "URL Protocol" ""
    WriteRegStr HKCR "corelive-todo\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
    WriteRegStr HKCR "corelive-todo\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  ${EndIf}
!macroend

!macro customUnInstall
  ; Remove URL scheme registration for current user
  DeleteRegKey HKCU "SOFTWARE\Classes\corelive-todo"
  
  ; Remove for all users if admin
  ${If} ${UAC_IsAdmin}
    DeleteRegKey HKCR "corelive-todo"
  ${EndIf}
!macroend