# Genera los iconos PNG de La Cesta (carrito de la compra) con System.Drawing.
# Uso: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $r * 2
  $path.AddArc([float]$x, [float]$y, [float]$d, [float]$d, [float]180, [float]90)
  $path.AddArc([float]($x + $w - $d), [float]$y, [float]$d, [float]$d, [float]270, [float]90)
  $path.AddArc([float]($x + $w - $d), [float]($y + $h - $d), [float]$d, [float]$d, [float]0, [float]90)
  $path.AddArc([float]$x, [float]($y + $h - $d), [float]$d, [float]$d, [float]90, [float]90)
  $path.CloseFigure()
  return $path
}

function Draw-Cesta([int]$size, [bool]$maskable, [string]$file) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [float]$size
  $rect = [System.Drawing.RectangleF]::new(0, 0, $s, $s)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 0, 166, 81),
    [System.Drawing.Color]::FromArgb(255, 0, 102, 54),
    55.0
  )
  if ($maskable) {
    $g.FillRectangle($brush, $rect)
  } else {
    $bgPath = New-RoundedRect 0 0 $s $s ($s * 0.225)
    $g.FillPath($brush, $bgPath)
    $bgPath.Dispose()
  }

  # Halo suave
  $halo = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $halo.AddEllipse($s * 0.12, $s * 0.08, $s * 0.76, $s * 0.76)
  $haloBrush = [System.Drawing.Drawing2D.PathGradientBrush]::new($halo)
  $haloBrush.CenterColor = [System.Drawing.Color]::FromArgb(38, 255, 255, 255)
  $haloBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillPath($haloBrush, $halo)

  # El carrito se dibuja en un lienzo de 1024 y se escala.
  $scale = if ($maskable) { $s / 1024.0 * 0.72 } else { $s / 1024.0 * 0.80 }
  $offset = ($s - 1024.0 * $scale) / 2.0
  $g.TranslateTransform([float]$offset, [float]$offset)
  $g.ScaleTransform([float]$scale, [float]$scale)

  $white = [System.Drawing.Color]::White
  $pen = [System.Drawing.Pen]::new($white, 58)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  # Asa
  $handle = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $handle.AddLine(205, 280, 320, 280)
  $handle.AddLine(320, 280, 405, 610)
  $g.DrawPath($pen, $handle)

  # Cesta
  $basket = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $basket.AddLine(350, 390, 805, 390)
  $basket.AddLine(805, 390, 740, 625)
  $basket.AddLine(740, 625, 438, 625)
  $basket.AddLine(438, 625, 386, 432)
  $basket.CloseFigure()
  $basketBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(46, 255, 255, 255))
  $g.FillPath($basketBrush, $basket)
  $g.DrawPath($pen, $basket)

  # Ruedas
  $wheelBrush = [System.Drawing.SolidBrush]::new($white)
  $g.FillEllipse($wheelBrush, 462, 690, 84, 84)
  $g.FillEllipse($wheelBrush, 688, 690, 84, 84)

  # Punto naranja (detalle)
  $accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 244, 145, 0))
  $g.FillEllipse($accent, 590, 470, 70, 70)

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)

  $accent.Dispose(); $wheelBrush.Dispose(); $basketBrush.Dispose(); $pen.Dispose()
  $basket.Dispose(); $handle.Dispose(); $haloBrush.Dispose(); $halo.Dispose()
  $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

Draw-Cesta 512 $false 'icon-512.png'
Draw-Cesta 192 $false 'icon-192.png'
Draw-Cesta 180 $false 'apple-touch-icon.png'
Draw-Cesta 32 $false 'favicon-32.png'
Draw-Cesta 512 $true 'maskable-512.png'

Write-Host "Iconos generados en $out"
