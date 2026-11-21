$ErrorActionPreference = 'Stop'
$toolsDir = "C:\AutoParkAndroidTools"
$jdkDir = "$toolsDir\jdk-17"
$sdkDir = "$toolsDir\android-sdk"

New-Item -ItemType Directory -Force $toolsDir | Out-Null
New-Item -ItemType Directory -Force $sdkDir | Out-Null

if (-not (Test-Path "$jdkDir\bin\java.exe")) {
    Write-Host "[1/4] Downloading Portable OpenJDK 17..." -ForegroundColor Cyan
    $jdkZip = "$toolsDir\jdk17.zip"
    Invoke-WebRequest -Uri "https://aka.ms/download-jdk/microsoft-jdk-17.0.13-windows-x64.zip" -OutFile $jdkZip -UseBasicParsing
    Expand-Archive -Path $jdkZip -DestinationPath $toolsDir -Force
    $extracted = Get-ChildItem $toolsDir -Directory | Where-Object { $_.Name -like "jdk-17*" -and $_.Name -ne "jdk-17" } | Select-Object -First 1
    if ($extracted) { Rename-Item $extracted.FullName $jdkDir -Force }
}

$env:JAVA_HOME = $jdkDir
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir
$env:Path = "$jdkDir\bin;$sdkDir\cmdline-tools\latest\bin;$sdkDir\platform-tools;$env:Path"

if (-not (Test-Path "$sdkDir\cmdline-tools\latest\bin\sdkmanager.bat")) {
    Write-Host "[2/4] Downloading Android Command-Line Tools..." -ForegroundColor Cyan
    $cmdZip = "$toolsDir\cmdline-tools.zip"
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile $cmdZip -UseBasicParsing
    New-Item -ItemType Directory -Force "$sdkDir\cmdline-tools" | Out-Null
    Expand-Archive -Path $cmdZip -DestinationPath "$sdkDir\cmdline-tools" -Force
    if (Test-Path "$sdkDir\cmdline-tools\cmdline-tools") {
        Rename-Item "$sdkDir\cmdline-tools\cmdline-tools" "$sdkDir\cmdline-tools\latest" -Force
    }
}

Write-Host "[3/4] Installing Android SDK Platform & Build-Tools..." -ForegroundColor Cyan
$yes = "y`n" * 40
$yes | & "$sdkDir\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdkDir" --licenses | Out-Null
& "$sdkDir\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$sdkDir" "platform-tools" "platforms;android-34" "platforms;android-35" "build-tools;34.0.0" "build-tools;35.0.0"

Write-Host "[4/4] Building AutoPark.apk with Flutter..." -ForegroundColor Cyan
Set-Location "d:\Auto Parke\mobile"
flutter config --android-sdk "$sdkDir"
flutter build apk --release --dart-define=API_BASE_URL=http://46.185.128.165:3000

Copy-Item "d:\Auto Parke\mobile\build\app\outputs\flutter-apk\app-release.apk" "d:\Auto Parke\AutoPark.apk" -Force
$desktopApk = Join-Path ([Environment]::GetFolderPath("Desktop")) "AutoPark.apk"
Copy-Item "d:\Auto Parke\AutoPark.apk" $desktopApk -Force
Write-Host "`nAPK Built Successfully: d:\Auto Parke\AutoPark.apk" -ForegroundColor Green
Write-Host "Also copied to Desktop: $desktopApk" -ForegroundColor Green
