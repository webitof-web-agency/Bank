import 'package:flutter/material.dart';

/// One line of text that, when it is wider than its space, scrolls left in an
/// endless loop (the text followed by a gap and itself again) instead of
/// being cut off with "…". Text that fits stays still.
class MarqueeText extends StatefulWidget {
  const MarqueeText(
    this.text, {
    super.key,
    this.style,
    this.gap = 40,
    this.pixelsPerSecond = 30,
    this.pause = const Duration(seconds: 2),
  });

  final String text;
  final TextStyle? style;
  final double gap;
  final double pixelsPerSecond;

  /// Hold at the start of each loop so the beginning can be read.
  final Duration pause;

  @override
  State<MarqueeText> createState() => _MarqueeTextState();
}

class _MarqueeTextState extends State<MarqueeText>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this);
  double _distance = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _run(double distance) {
    if (distance == _distance) return;
    _distance = distance;
    _controller.stop();
    _controller.value = 0;
    if (distance <= 0) return;
    final scrollMs = (distance / widget.pixelsPerSecond * 1000).round();
    final pauseMs = widget.pause.inMilliseconds;
    _controller.duration = Duration(milliseconds: scrollMs + pauseMs);
    _controller.repeat();
  }

  @override
  Widget build(BuildContext context) {
    final style = DefaultTextStyle.of(context).style.merge(widget.style);
    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: style),
          maxLines: 1,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout();
        final textWidth = painter.width;
        final fits = textWidth <= constraints.maxWidth;
        final distance = fits ? 0.0 : textWidth + widget.gap;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _run(distance);
        });

        final line = Text(
          widget.text,
          style: style,
          maxLines: 1,
          softWrap: false,
        );
        if (fits) return line;

        final pauseShare =
            widget.pause.inMilliseconds /
            (widget.pause.inMilliseconds +
                distance / widget.pixelsPerSecond * 1000);
        return SizedBox(
          height: painter.height,
          child: ClipRect(
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                final t = _controller.value;
                final progress = t <= pauseShare
                    ? 0.0
                    : (t - pauseShare) / (1 - pauseShare);
                return OverflowBox(
                  alignment: Alignment.centerLeft,
                  minWidth: 0,
                  maxWidth: double.infinity,
                  child: Transform.translate(
                    offset: Offset(-distance * progress, 0),
                    child: child,
                  ),
                );
              },
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  line,
                  SizedBox(width: widget.gap),
                  line,
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
