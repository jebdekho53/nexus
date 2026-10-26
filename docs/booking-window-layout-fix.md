# Booking window placement, footer and minimize

The old tiler moved a new box left when the row ran out of space without checking whether that slot was already occupied. It now tries unoccupied positions and wraps to a free row. Repeated readiness/show events preserve the assigned position, and only a genuine will-move drag releases the position guard.

The compact 348 × 241 layout reserves explicit header/status/footer heights and compacts the existing controls. The footer shows selected payment, actual availability when present, and clock; fixed demonstration labels were removed.

The minimize button now invokes matrix:booking:minimize, validated against the local booking renderer and targeted to its own BrowserWindow. It enables native minimization and taskbar visibility, and opening a minimized booking window restores it. It no longer falls back to minimizing the controller or closing the booking.

Ten targeted checks passed. An isolated release profile with synthetic forms/status then opened six actual native boxes, confirmed non-overlap and on-screen bounds, and minimized/restored the sixth using its renderer button. All measured windows remained 348 × 241. Footer measured top 223 / bottom 241; auxiliary actions ended at 194. No booking or payment was started; saved customer forms were not changed by the fixture. Evidence: diagnostics/booking-window-six-verified.json and diagnostics/booking-box-layout-fixed.png.
