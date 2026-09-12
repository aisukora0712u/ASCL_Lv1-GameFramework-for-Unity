param(
    [string]$UnityEditor = $env:UNITY_EDITOR_PATH,
    [ValidateSet('All', 'EditMode', 'PlayMode')]
    [string]$TestPlatform = 'All'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Unity-Environment.ps1')
$environment = Get-ASCLUnityEnvironment -UnityEditor $UnityEditor
$UnityEditor = $environment.Editor
$projectPath = $environment.ProjectPath

$resultsDirectory = Join-Path $projectPath 'TestResults'
$logsDirectory = Join-Path $projectPath 'Logs'
New-Item -ItemType Directory -Path $resultsDirectory, $logsDirectory -Force | Out-Null
$platforms = if ($TestPlatform -eq 'All') { @('EditMode', 'PlayMode') } else { @($TestPlatform) }
foreach ($platform in $platforms) {
    $resultPath = Join-Path $resultsDirectory "$platform.xml"
    $logPath = Join-Path $logsDirectory "unity-$platform.log"
    # A failed invocation must never be mistaken for a previous successful run.
    if (Test-Path -LiteralPath $resultPath) { Remove-Item -LiteralPath $resultPath }
    $unityArguments = @(
        '-batchmode', '-projectPath', ('"{0}"' -f $projectPath),
        '-runTests', '-testPlatform', $platform,
        '-testResults', ('"{0}"' -f $resultPath), '-logFile', ('"{0}"' -f $logPath)
    )
    if ($platform -eq 'EditMode') { $unityArguments += '-nographics' }
    else { $unityArguments += '-force-d3d11' }
    # Unity Test Framework exits after writing results; -quit would interrupt tests.
    $unityProcess = Start-Process -FilePath $UnityEditor -ArgumentList $unityArguments -WindowStyle Hidden -PassThru
    $unityProcess.WaitForExit()
    if ($unityProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $resultPath)) {
        throw "$platform failed (exit $($unityProcess.ExitCode)). See $logPath."
    }
    [xml]$results = Get-Content -LiteralPath $resultPath -Raw
    $run = $results.'test-run'
    if ($run.result -ne 'Passed' -or [int]$run.total -eq 0 -or [int]$run.failed -ne 0) {
        throw "$platform did not pass. See $resultPath and $logPath."
    }
    Write-Output "$platform passed: $($run.passed)/$($run.total). Results: $resultPath"
}
