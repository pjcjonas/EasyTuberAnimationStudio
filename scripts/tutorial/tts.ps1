# Speaks the tutorial's lines with a Windows voice, one WAV per line.
#   powershell -ExecutionPolicy Bypass -File tts.ps1 -Clips clips.json -Out <folder> [-Voice "Mark,David"] [-Rate 1.0]
# clips.json: [{ "id": "c1_2", "text": "..." }]. -Voice is a list of names to try, in order.
# Uses the Windows.Media.SpeechSynthesis voices (the ones in Settings > Time & language > Speech),
# which include the US English pack's David and Mark. Prints the voice it used.
param(
  [Parameter(Mandatory = $true)][string]$Clips,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Voice = 'Mark,David',
  [double]$Rate = 1.0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$chosen = $null
foreach ($name in $Voice.Split(',')) {
  $chosen = $all | Where-Object { $_.DisplayName -like "*$($name.Trim())*" } | Select-Object -First 1
  if ($chosen) { break }
}
if (-not $chosen) {
  $have = ($all | ForEach-Object { $_.DisplayName }) -join ', '
  Write-Error "None of these voices is installed: $Voice. Installed: $have. Add 'English (United States)' in Settings > Time & language > Speech."
  exit 2
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $chosen
$synth.Options.SpeakingRate = $Rate
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$list = Get-Content -Raw -Encoding UTF8 $Clips | ConvertFrom-Json
foreach ($c in $list) {
  $stream = Await ($synth.SynthesizeTextToStreamAsync($c.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes((Join-Path $Out ($c.id + '.wav')), $bytes)
  $reader.Dispose(); $stream.Dispose()
}
Write-Output ("VOICE " + $chosen.DisplayName)
