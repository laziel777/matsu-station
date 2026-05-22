$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;$env:APPDATA\npm;$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin;$env:Path"

Write-Host "Terminal PATH fixed for this window."
Write-Host ""
Write-Host "Node:"
node --version
Write-Host "npm:"
npm --version
Write-Host "Firebase:"
firebase --version
Write-Host "Git:"
git --version
