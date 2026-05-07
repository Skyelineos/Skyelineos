# Mobile Style Guide - Odessey Pro Construction Management

## Typography Scale
Our mobile-first typography uses CSS `clamp()` for fluid scaling:

```css
--font-size-xs: clamp(0.75rem, 2vw, 0.875rem);      /* 12px → 14px */
--font-size-sm: clamp(0.875rem, 2.5vw, 1rem);       /* 14px → 16px */
--font-size-base: clamp(1rem, 3vw, 1.125rem);       /* 16px → 18px */
--font-size-lg: clamp(1.125rem, 3.5vw, 1.25rem);    /* 18px → 20px */
--font-size-xl: clamp(1.25rem, 4vw, 1.5rem);        /* 20px → 24px */
--font-size-2xl: clamp(1.5rem, 4.5vw, 1.875rem);    /* 24px → 30px */
--font-size-3xl: clamp(1.875rem, 5vw, 2.25rem);     /* 30px → 36px */
```

### Usage
- **Headings**: Use `text-fluid-3xl`, `text-fluid-2xl`, `text-fluid-xl`
- **Body text**: Use `text-fluid-base` for main content
- **Small text**: Use `text-fluid-sm` for labels, captions
- **Micro text**: Use `text-fluid-xs` for timestamps, metadata

## Breakpoints
```javascript
'xs': '360px',   // Extra small phones
'sm': '640px',   // Small phones
'md': '768px',   // Tablets
'lg': '1024px',  // Desktops
'xl': '1280px',  // Large desktops
'2xl': '1536px'  // Extra large screens
```

## Spacing Rules
- **Mobile containers**: `p-2 pt-4` for page content
- **Desktop containers**: `p-3 sm:p-4 lg:p-6`
- **Card padding**: `p-4 md:p-6`
- **Stack spacing**: `space-y-4 md:space-y-6`

## Touch Targets
All interactive elements must be at least 44×44px:
```css
.touch-target {
  min-height: 44px;
  min-width: 44px;
}
```

## Layout Patterns

### Cards
```tsx
// DO: Mobile-first card with proper spacing
<Card className="rounded-xl shadow-sm touch-target">
  <CardHeader className="p-4 md:p-6">
    <CardTitle className="text-fluid-lg text-wrap min-w-0">
      Title Here
    </CardTitle>
  </CardHeader>
  <CardContent className="p-4 md:p-6 pt-0">
    {/* Content */}
  </CardContent>
</Card>
```

### Grids
```tsx
// DO: Mobile-first grid
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
  {items}
</div>

// DON'T: Desktop-first that breaks on mobile
<div className="grid grid-cols-2 gap-6">
  {items}
</div>
```

### Tables
Use the `MobileTable` component for responsive data tables:
```tsx
<MobileTable
  data={data}
  columns={[
    { key: 'name', label: 'Name', priority: 'high' },
    { key: 'status', label: 'Status', priority: 'medium' },
    { key: 'date', label: 'Date', priority: 'low' },
  ]}
/>
```

## Overflow Prevention

### Text Wrapping
Always apply text wrapping to prevent horizontal overflow:
```tsx
// DO: Proper text wrapping
<div className="min-w-0">
  <h1 className="text-fluid-2xl text-wrap">Long Title Here</h1>
</div>

// DON'T: No overflow protection
<h1>Very Long Title That Might Overflow</h1>
```

### Flex Items
Prevent flex items from growing too wide:
```tsx
// DO: Flex with overflow protection
<div className="flex gap-2 min-w-0">
  <span className="flex-1 min-w-0 text-wrap">Long text</span>
  <Badge className="flex-shrink-0">Status</Badge>
</div>
```

## Forms
- Use `font-size: max(16px, 1rem)` to prevent iOS zoom
- Minimum touch target of 44px height
- Proper focus states with `focus-visible:ring-2`

## Safe Areas (iOS)
```css
/* Utility classes for iPhone notch/home bar */
.safe-top { padding-top: env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-left { padding-left: env(safe-area-inset-left); }
.safe-right { padding-right: env(safe-area-inset-right); }
```

## Do's and Don'ts

### ✅ DO
- Use mobile-first responsive design
- Apply `min-w-0` to flex/grid children that might overflow
- Use `text-wrap` class for long content
- Test on 320px, 360px, 390px, 414px widths
- Use touch-friendly 44px minimum touch targets
- Implement proper focus states
- Use semantic HTML and proper ARIA labels

### ❌ DON'T
- Use fixed pixel widths that don't scale
- Ignore text wrapping on long content
- Create touch targets smaller than 44px
- Use hover-only interactions (add focus/active states)
- Assume desktop layouts work on mobile
- Use color-only visual indicators
- Create horizontal scrolling (except intentional carousels)

## Common Classes
```css
/* Responsive utilities */
.text-fluid-*     /* Fluid typography */
.min-w-0         /* Prevent overflow in flex/grid */
.text-wrap       /* Text wrapping with hyphens */
.touch-target    /* 44px minimum touch target */
.safe-*          /* iOS safe area padding */

/* Mobile-first spacing */
.p-2.md:p-6      /* Progressive padding */
.space-y-4.md:space-y-6  /* Progressive vertical spacing */
```

## Testing Checklist
- [ ] No horizontal scroll on 320px - 414px
- [ ] All buttons/links are 44px minimum
- [ ] Text wraps properly, no overflow
- [ ] Touch interactions work (not just hover)
- [ ] Focus states visible for keyboard navigation
- [ ] Safe areas respected on iOS simulators
- [ ] Lighthouse Mobile scores: Performance ≥80, Accessibility ≥90