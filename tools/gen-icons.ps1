# Генератор иконок «Турник дома»: турник с человечком на фоне фирменного синего.
# Рисует PNG нужных размеров через System.Drawing. Запуск из корня проекта:
#   powershell -ExecutionPolicy Bypass -File app/tools/gen-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$out, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(0x2f, 0x5d, 0x7c))

  $w = [float]$size; $h = [float]$size
  if ($maskable) { $w = $size * 0.72; $h = $size * 0.72 }  # содержимое — в безопасной зоне
  $ox = ($size - $w) / 2; $oy = ($size - $h) / 2
  $white = [System.Drawing.Color]::FromArgb(0xff, 0xff, 0xff)
  $penW = [Math]::Max(2, $w * 0.045)
  $pen = New-Object System.Drawing.Pen $white, $penW
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $brush = New-Object System.Drawing.SolidBrush $white

  # Стояки и перекладина турника
  $postX1 = $ox + $w * 0.24; $postX2 = $ox + $w * 0.76
  $top = $oy + $h * 0.16; $barY = $oy + $h * 0.30
  $g.DrawLine($pen, $postX1, $top, $postX1, $barY)
  $g.DrawLine($pen, $postX2, $top, $postX2, $barY)
  $g.DrawLine($pen, $postX1, $barY, $postX2, $barY)

  # Человечек: голова, руки к перекладине, корпус, ноги
  $cx = $ox + $w * 0.5
  $headR = $w * 0.062
  $headCY = $oy + $h * 0.42
  $g.FillEllipse($brush, $cx - $headR, $headCY - $headR, 2 * $headR, 2 * $headR)

  $shoulderY = $oy + $h * 0.52; $hipY = $oy + $h * 0.66
  $armLen = $w * 0.09
  $g.DrawLine($pen, $cx, $shoulderY, $cx - $armLen, $barY + $penW / 2)
  $g.DrawLine($pen, $cx, $shoulderY, $cx + $armLen, $barY + $penW / 2)
  $g.DrawLine($pen, $cx, $headCY + $headR, $cx, $hipY)
  $g.DrawLine($pen, $cx, $hipY, $cx - $w * 0.06, $oy + $h * 0.84)
  $g.DrawLine($pen, $cx, $hipY, $cx + $w * 0.06, $oy + $h * 0.84)

  $g.Dispose()
  $dir = Split-Path $out -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "сохранено: $out"
}

New-Icon 512 'app/icons/icon-512.png' $false
New-Icon 192 'app/icons/icon-192.png' $false
New-Icon 512 'app/icons/icon-512-maskable.png' $true
New-Icon 180 'app/icons/apple-touch-icon.png' $true
