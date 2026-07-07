param(
  [int]$Port = 3000,
  [switch]$Foreground,
  [string]$NodePath = "",
  [string]$NextCliPath = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runInBackground = -not $Foreground

if (-not $NodePath) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

  if (-not $nodeCommand) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  }

  if (-not $nodeCommand) {
    throw "node was not found. Install Node.js or pass -NodePath."
  }

  $NodePath = $nodeCommand.Source
}

if (-not $NextCliPath) {
  $NextCliPath = Join-Path $projectRoot "node_modules\next\dist\bin\next"
}

if (-not (Test-Path $NextCliPath)) {
  throw "Next.js CLI was not found at $NextCliPath. Run dependency install first."
}

$rawEnvironment = [System.Environment]::GetEnvironmentVariables("Process")
$cleanEnvironment = [System.Collections.Generic.Dictionary[string,string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
$pathParts = [System.Collections.Generic.List[string]]::new()

foreach ($entry in $rawEnvironment.GetEnumerator()) {
  $name = [string]$entry.Key
  $value = [string]$entry.Value

  if ($name -ieq "PATH") {
    if ($value) {
      foreach ($part in $value -split ";") {
        $trimmed = $part.Trim()

        if ($trimmed) {
          $pathParts.Add($trimmed)
        }
      }
    }

    continue
  }

  if (-not $cleanEnvironment.ContainsKey($name)) {
    $cleanEnvironment[$name] = $value
  }
}

$seenPathParts = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
$mergedPathParts = [System.Collections.Generic.List[string]]::new()

foreach ($part in $pathParts) {
  if ($seenPathParts.Add($part)) {
    $mergedPathParts.Add($part)
  }
}

$cleanEnvironment["Path"] = [string]::Join(";", $mergedPathParts)
$cleanEnvironment["PORT"] = [string]$Port

function Set-CleanProcessEnvironment {
  param(
    [System.Diagnostics.ProcessStartInfo]$StartInfo,
    [System.Collections.Generic.Dictionary[string,string]]$Environment
  )

  $targetEnvironment = $StartInfo.Environment

  if ($null -eq $targetEnvironment) {
    $targetEnvironment = $StartInfo.EnvironmentVariables
  }

  if ($null -eq $targetEnvironment) {
    throw "Unable to access ProcessStartInfo environment collection."
  }

  $targetEnvironment.Clear()

  foreach ($key in $Environment.Keys) {
    $targetEnvironment[$key] = $Environment[$key]
  }
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $NodePath
$startInfo.WorkingDirectory = [string]$projectRoot
$startInfo.UseShellExecute = $false
$startInfo.Arguments = "`"$NextCliPath`" dev -p $Port"
Set-CleanProcessEnvironment -StartInfo $startInfo -Environment $cleanEnvironment

if ($runInBackground) {
  $backgroundInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $backgroundInfo.FileName = $NodePath
  $backgroundInfo.WorkingDirectory = [string]$projectRoot
  $backgroundInfo.UseShellExecute = $false
  $backgroundInfo.CreateNoWindow = $true
  $backgroundInfo.Arguments = "`"$NextCliPath`" dev -p $Port"
  Set-CleanProcessEnvironment -StartInfo $backgroundInfo -Environment $cleanEnvironment

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $backgroundInfo
  [void]$process.Start()

  [PSCustomObject]@{
    ProcessId = $process.Id
    Port = $Port
    Url = "http://127.0.0.1:$Port/documents/doc-ai-education"
    StdoutLog = "not redirected in clean background mode"
    StderrLog = "not redirected in clean background mode"
    PathKeysMerged = "PATH, Path -> Path"
  }

  return
}

$process = [System.Diagnostics.Process]::Start($startInfo)
$process.WaitForExit()
exit $process.ExitCode
