# Desktop branding and actions

The shared matrix-visual.css stylesheet is linked after local styles in all 22 renderer documents. It applies the approved Matrix logo, readable light backplates, one emerald primary action colour (#22d6a1), dark secondary actions and red destructive/stop actions.

matrix-brand.js inserts header logos and replaces the New Form sidebar wordmark with the approved asset. Decorative MATRIX text beside existing booking/QR/receipt logos is hidden. Functional screen names and action labels remain readable. Splash shows the logo and build version. Branding no longer incorrectly assigns the controller class to other pages containing a logo.

Release verification: all nine main workspace pages loaded their 34 × 34 header logos; the old MATRIX / prefix was absent; every visible primary action measured rgb(34, 214, 161); none had horizontal overflow. Evidence: diagnostics/shared-visual-review.json. New Form, Tools and Login Data screenshots were inspected. No installer/updater was built or published.
