@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  build-android.bat  -  TxTt-Android (Capacitor) APK-bygg
REM  Legg i PROSJEKTROTEN (samme mappe som package.json + android\).
REM  Ordner Java (JDK) OG Android SDK automatisk.
REM  Resultat:  apk-output\TxTt-debug.apk
REM ============================================================

cd /d "%~dp0"

echo.
echo [1/5] Bygger web-appen (vite build)...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [2/5] Synker til Android (cap sync)...
call npx cap sync android
if errorlevel 1 goto :fail

echo.
echo [3/5] Forbereder Java (JDK)...
if not defined JAVA_HOME (
  for %%J in (
    "%ProgramFiles%\Android\Android Studio\jbr"
    "%ProgramFiles%\Android\Android Studio\jre"
    "%LOCALAPPDATA%\Programs\Android Studio\jbr"
    "%LOCALAPPDATA%\Programs\Android Studio\jre"
    "%ProgramFiles%\Java\jdk-17"
    "%ProgramFiles%\Eclipse Adoptium\jdk-17"
  ) do (
    if not defined JAVA_HOME if exist "%%~J\bin\java.exe" set "JAVA_HOME=%%~J"
  )
)
if not defined JAVA_HOME (
  echo FEIL: Fant ingen Java/JDK. Aapne i Android Studio: npx cap open android
  goto :fail
)
echo Bruker JAVA_HOME=!JAVA_HOME!
set "PATH=!JAVA_HOME!\bin;!PATH!"

echo.
echo [4/5] Sjekker Android SDK (local.properties)...
if exist "android\local.properties" (
  echo local.properties finnes allerede - bruker den.
) else (
  call :find_sdk
  if not defined ANDROID_SDK (
    echo FEIL: Fant ikke Android SDK.
    echo   Aapne Android Studio -^> SDK Manager og installer en SDK-plattform,
    echo   eller sjekk stien under Settings -^> Android SDK og lag
    echo   android\local.properties manuelt: sdk.dir=^<sti med skraastrek frem^>
    goto :fail
  )
  set "SDK_FWD=!ANDROID_SDK:\=/!"
  > "android\local.properties" echo sdk.dir=!SDK_FWD!
  echo Skrev android\local.properties -^> sdk.dir=!SDK_FWD!
)

echo.
echo [5/5] Bygger APK med Gradle (assembleDebug)...
if not exist "android\gradlew.bat" (
  echo FEIL: Fant ikke android\gradlew.bat - kjor evt: npx cap add android
  goto :fail
)
cd android
call gradlew.bat assembleDebug
if errorlevel 1 ( cd .. & goto :fail )
cd ..

set "APK_SRC=android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_SRC%" (
  echo FEIL: Fant ikke APK-en paa: %APK_SRC%
  goto :fail
)
if not exist "apk-output" mkdir "apk-output"
copy /y "%APK_SRC%" "apk-output\TxTt-debug.apk" >nul

echo.
echo ============================================================
echo  FERDIG!
echo  APK (enkel sti):  %~dp0apk-output\TxTt-debug.apk
echo  APK (original):   %~dp0%APK_SRC%
echo ============================================================
echo.
pause
exit /b 0

:find_sdk
set "ANDROID_SDK="
if defined ANDROID_HOME if exist "%ANDROID_HOME%\platform-tools" set "ANDROID_SDK=%ANDROID_HOME%"
if defined ANDROID_SDK goto :eof
if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platform-tools" set "ANDROID_SDK=%ANDROID_SDK_ROOT%"
if defined ANDROID_SDK goto :eof
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools" set "ANDROID_SDK=%LOCALAPPDATA%\Android\Sdk"
if defined ANDROID_SDK goto :eof
set "PF86=%ProgramFiles(x86)%"
if exist "%PF86%\Android\android-sdk\platform-tools" set "ANDROID_SDK=%PF86%\Android\android-sdk"
goto :eof

:fail
echo.
echo ============================================================
echo  BYGGET FEILET paa steget over. Les feilteksten ovenfor.
echo  Kopier de siste linjene og lim dem inn i chatten.
echo ============================================================
echo.
pause
exit /b 1
