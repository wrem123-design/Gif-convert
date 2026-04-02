Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root "app\\build"
if (-not (Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

$pngPath = Join-Path $buildDir "icon.png"
$icoPath = Join-Path $buildDir "icon.ico"

$size = 1024
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundRect = New-Object System.Drawing.RectangleF 72, 72, 880, 880
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 210.0
$diameter = $radius * 2
$path.AddArc($backgroundRect.X, $backgroundRect.Y, $diameter, $diameter, 180, 90)
$path.AddArc($backgroundRect.Right - $diameter, $backgroundRect.Y, $diameter, $diameter, 270, 90)
$path.AddArc($backgroundRect.Right - $diameter, $backgroundRect.Bottom - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc($backgroundRect.X, $backgroundRect.Bottom - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point 0, 0),
  (New-Object System.Drawing.Point $size, $size),
  ([System.Drawing.Color]::FromArgb(255, 21, 31, 45)),
  ([System.Drawing.Color]::FromArgb(255, 39, 72, 98))
)
$graphics.FillPath($gradient, $path)

$outlinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(235, 127, 237, 255)), 22
$graphics.DrawPath($outlinePen, $path)

$gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(92, 160, 230, 255)), 14
for ($i = 0; $i -lt 4; $i++) {
  $x = 196 + ($i * 156)
  $graphics.DrawLine($gridPen, $x, 252, $x, 764)
}
for ($i = 0; $i -lt 4; $i++) {
  $y = 252 + ($i * 156)
  $graphics.DrawLine($gridPen, 196, $y, 664, $y)
}

$pixelBrushA = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 145, 77))
$pixelBrushB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 196, 84))
$graphics.FillRectangle($pixelBrushA, 664, 252, 156, 156)
$graphics.FillRectangle($pixelBrushB, 820, 408, 0, 0)
$graphics.FillRectangle($pixelBrushB, 664, 564, 156, 156)
$graphics.FillRectangle($pixelBrushA, 820, 720, 0, 0)

$accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 182, 64))
$graphics.FillRectangle($accentBrush, 690, 278, 104, 104)
$graphics.FillRectangle($accentBrush, 690, 590, 104, 104)

$fontFamily = New-Object System.Drawing.FontFamily "Segoe UI"
$font = New-Object System.Drawing.Font $fontFamily, 300, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 241, 249, 255))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRectShadow = New-Object System.Drawing.RectangleF 222, 290, 420, 390
$textRect = New-Object System.Drawing.RectangleF 210, 278, 420, 390
$graphics.DrawString("S", $font, $shadowBrush, $textRectShadow, $sf)
$graphics.DrawString("S", $font, $textBrush, $textRect, $sf)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$iconBitmap = New-Object System.Drawing.Bitmap 256, 256
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$iconGraphics.DrawImage($bitmap, 0, 0, 256, 256)

$iconHandle = $iconBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$fileStream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($fileStream)
$fileStream.Close()

$graphics.Dispose()
$bitmap.Dispose()
$gradient.Dispose()
$outlinePen.Dispose()
$gridPen.Dispose()
$pixelBrushA.Dispose()
$pixelBrushB.Dispose()
$accentBrush.Dispose()
$shadowBrush.Dispose()
$textBrush.Dispose()
$font.Dispose()
$fontFamily.Dispose()
$path.Dispose()
$iconGraphics.Dispose()
$icon.Dispose()
$iconBitmap.Dispose()

Write-Output "Generated icon assets:"
Write-Output $pngPath
Write-Output $icoPath
