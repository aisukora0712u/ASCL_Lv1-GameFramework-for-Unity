function Get-ASCLUnityEnvironment {
    param([string]$UnityEditor)

    $repositoryPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
    $projectPath = Join-Path $repositoryPath 'DevProject'
    $versionFile = Get-Content -LiteralPath (Join-Path $projectPath 'ProjectSettings/ProjectVersion.txt')
    $expectedVersion = ($versionFile | Where-Object { $_ -match '^m_EditorVersion:' }) -replace '^m_EditorVersion:\s*', ''
    if (-not $UnityEditor -or -not (Test-Path -LiteralPath $UnityEditor -PathType Leaf)) {
        throw "Pass -UnityEditor <path to Unity.exe> or set UNITY_EDITOR_PATH. Required version: $expectedVersion."
    }
    $UnityEditor = (Get-Item -LiteralPath $UnityEditor).FullName
    $actualVersion = (Get-Item -LiteralPath $UnityEditor).VersionInfo.ProductVersion
    if (($actualVersion -split '_')[0] -ne $expectedVersion) {
        throw "Expected Unity $expectedVersion, found $actualVersion at $UnityEditor."
    }

    # Unity's managed shader importers can still fail on paths exceeding MAX_PATH.
    # Map the repository, so the relative local ASCL package reference also works.
    if ($projectPath.Length -gt 64) {
        $mappedDrive = $null
        foreach ($mapping in (& subst.exe)) {
            if ($mapping -match '^([A-Za-z]):\\: => (.+)$' -and $Matches[2].TrimEnd('\') -eq $repositoryPath) {
                $mappedDrive = $Matches[1] + ':'
                break
            }
        }
        if (-not $mappedDrive) {
            $occupied = @([IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name.Substring(0, 1) })
            foreach ($letter in @('U', 'V', 'W', 'X', 'Y', 'Z', 'T', 'S', 'R', 'Q')) {
                if ($letter -notin $occupied) {
                    $candidate = $letter + ':'
                    & subst.exe $candidate $repositoryPath
                    if ($LASTEXITCODE -ne 0) { throw "Could not map $candidate to $repositoryPath." }
                    $mappedDrive = $candidate
                    break
                }
            }
        }
        if (-not $mappedDrive) { throw 'No free drive letter for a short Unity path. Use a shorter checkout directory.' }
        $projectPath = $mappedDrive + '\DevProject'
        Write-Host "Unity project: $projectPath (same files as $repositoryPath\DevProject)"
        Write-Host "The mapping stays available for Unity Hub. After closing Unity, remove it with: subst $mappedDrive /D"
    }
    [pscustomobject]@{ Editor = $UnityEditor; ProjectPath = $projectPath; Version = $expectedVersion }
}
