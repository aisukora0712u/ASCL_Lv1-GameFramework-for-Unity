param([string]$UnityEditor = $env:UNITY_EDITOR_PATH)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Unity-Environment.ps1')
$environment = Get-ASCLUnityEnvironment -UnityEditor $UnityEditor
# This is the user-invoked interactive launcher, using the same path as validation.
Start-Process -FilePath $environment.Editor -ArgumentList @(
    '-projectPath', ('"{0}"' -f $environment.ProjectPath)
) -WindowStyle Normal
