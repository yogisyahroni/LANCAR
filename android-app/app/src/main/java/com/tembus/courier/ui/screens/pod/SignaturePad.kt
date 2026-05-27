package com.tembus.courier.ui.screens.pod

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp

/**
 * Custom Canvas-Based Signature Drawing Pad
 * Provides high fidelity vector tracing and exports direct Android Bitmap representations.
 */
@Composable
fun SignaturePad(
    modifier: Modifier = Modifier,
    onSignatureCaptured: (Bitmap) -> Unit,
    onClear: () -> Unit = {},
    strokeWidth: Float = 8f,
    strokeColor: ComposeColor = ComposeColor.Black,
    backgroundColor: ComposeColor = ComposeColor.White
) {
    val paths = remember { mutableStateListOf<Path>() }
    var currentPath by remember { mutableStateOf<Path?>(null) }
    var drawingSize by remember { mutableStateOf(IntSize.Zero) }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(backgroundColor)
                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            val path = Path().apply {
                                moveTo(offset.x, offset.y)
                            }
                            currentPath = path
                            paths.add(path)
                        },
                        onDragEnd = {
                            currentPath = null
                        },
                        onDragCancel = {
                            currentPath = null
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            currentPath?.let { path ->
                                val target = change.position
                                path.lineTo(target.x, target.y)
                                // Re-add or trigger reference updates for standard Compose state triggering
                                val lastIndex = paths.lastIndex
                                if (lastIndex >= 0) {
                                    paths[lastIndex] = Path().apply {
                                        addPath(path)
                                    }
                                }
                            }
                        }
                    )
                }
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .onGloballyPositioned { drawingSize = it.size }
            ) {
                paths.forEach { path ->
                    drawPath(
                        path = path,
                        color = strokeColor,
                        style = Stroke(
                            width = strokeWidth,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        )
                    )
                }
            }

            if (paths.isEmpty()) {
                Text(
                    text = "Gambarkan Tanda Tangan Disini",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Button(
                onClick = {
                    paths.clear()
                    currentPath = null
                    onClear()
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer
                ),
                modifier = Modifier.weight(1f)
            ) {
                Text("Reset")
            }

            Spacer(modifier = Modifier.width(16.dp))

            Button(
                onClick = {
                    if (paths.isNotEmpty() && drawingSize.width > 0 && drawingSize.height > 0) {
                        val bitmap = renderSignatureToBitmap(
                            paths = paths,
                            width = drawingSize.width,
                            height = drawingSize.height,
                            strokeWidth = strokeWidth,
                            backgroundColor = Color.WHITE,
                            strokeColor = Color.BLACK
                        )
                        onSignatureCaptured(bitmap)
                    }
                },
                enabled = paths.isNotEmpty(),
                modifier = Modifier.weight(1f)
            ) {
                Text("Simpan")
            }
        }
    }
}

/**
 * Deep renders Compose paths context into native Android Bitmap buffer.
 */
fun renderSignatureToBitmap(
    paths: List<Path>,
    width: Int,
    height: Int,
    strokeWidth: Float,
    backgroundColor: Int,
    strokeColor: Int
): Bitmap {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(backgroundColor)

    val paint = Paint().apply {
        color = strokeColor
        style = Paint.Style.STROKE
        this.strokeWidth = strokeWidth
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }

    for (path in paths) {
        canvas.drawPath(path.asAndroidPath(), paint)
    }
    return bitmap
}
