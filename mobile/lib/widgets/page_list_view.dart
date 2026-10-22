import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Content never grows wider than this on a tablet / desktop browser.
const double kContentMaxWidth = 760;

/// From this width the home screen swaps the bottom bar for a side rail.
const double kWideLayoutWidth = 840;

/// Side padding that keeps content at most [maxWidth] wide and centred in
/// [width], and never less than 16 (the phone layout).
double pageSideInset(double width, {double maxWidth = kContentMaxWidth}) =>
    math.max(16, (width - maxWidth) / 2);

/// A ListView whose content is centred and at most [kContentMaxWidth] wide,
/// while the whole width still scrolls (the mouse wheel over the margins
/// too). On a phone it is the usual 16-padded list.
class PageListView extends StatelessWidget {
  const PageListView({
    super.key,
    required this.children,
    this.top = 16,
    this.bottom = 32,
  });

  final List<Widget> children;
  final double top;
  final double bottom;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final side = pageSideInset(box.maxWidth);
        return ListView(
          padding: EdgeInsets.fromLTRB(side, top, side, bottom),
          children: children,
        );
      },
    );
  }
}
