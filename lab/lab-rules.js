/**
 * Lab rule overrides — the extensibility hook for the TSL player ruleset.
 *
 * The player interprets each block through TSL_BLOCK_RULES (player/tsl.js), which is
 * taken from the spec files. Validated block properties map to CSS rule classes, CSS
 * vars and attributes, and player/tsl.css styles those classes. The lab can replace or
 * extend those rules here without forking the player. Put matching styles in
 * player/lab.css, which loads after tsl.css.
 *
 * Loaded after ../player/tsl.js and before lab.js, so overrides apply before the first
 * render. Open the lab with ?rules=spec to skip lab overrides and render the spec
 * ruleset as-is.
 *
 * TalesmithTsl.defineBlockRules(patch, { replace: false })
 *   patch.common            rules for every block type (align, cols, theme)
 *   patch.types[type]       rules for one block type; null removes the type's rules
 *   patch.derive / .format / .normalize  named functions for derive: / format: / normalize: rules
 *   Per property, a rule object is merged onto the existing rule; null removes the
 *   property. With { replace: true }, each group named in the patch is swapped wholesale.
 * TalesmithTsl.resetBlockRules()     back to the spec ruleset
 * TalesmithTsl.blockRules            the live ruleset (read it to inspect)
 *
 * Rule fields: values | type ('boolean'|'int'|'string') + min/max/clamp/maxLength,
 * def, cls (class "<cls>-<value>"), emitDefault, flag (class when true),
 * forces (emit another prop's class even at default), cssVar + unit,
 * attr + format, derive, normalize (type 'object'), blankIsDefault (type 'string'),
 * renderers (['paged', 'lean']: limit the class/var/attr mapping to those renderers).
 *
 * Examples (not active; T = window.TalesmithTsl):
 *
 *   // Paragraphs: default to justified (emits align-justify on every paragraph)
 *   // (a type-level align rule shadows common.align for that type only)
 *   T.defineBlockRules({ types: { paragraph: { align: Object.assign({}, T.blockRules.common.align, { def: 'justify', emitDefault: true }) } } });
 *
 *   // Headings: drop the outline-number attribute/prefix for h3
 *   T.defineBlockRules({ types: { h3: { number: null } } });
 *
 *   // Headings: format numbers as "§1" instead of "1."
 *   T.defineBlockRules({ format: { labNumber: function (v) { return '§' + String(v).replace(/\.$/, ''); } },
 *                        types: { h1: { number: { format: 'labNumber' } } } });
 *
 *   // Callouts: hide the default icon (an aside's own icon still shows)
 *   T.defineBlockRules({ types: { aside: { icon: { def: '' } } } });
 *
 *   // A lab-only derived flag, styled in lab.css (.lab-short { … })
 *   T.defineBlockRules({ types: { paragraph: { short: {
 *       derive: function (b) { return String(b.text || '').length < 40; },
 *       type: 'boolean', def: false, flag: 'lab-short' } } } });
 */
(function (T) {
    'use strict';
    if (!T || typeof T.defineBlockRules !== 'function') {
        return;
    }
    if (/[?&]rules=spec(?:&|$)/.test(window.location.search)) {
        return;
    }

    /* Lab overrides go here. Empty by default: the lab renders the spec ruleset. */
    var LAB_RULES = {
        types: {}
    };

    T.defineBlockRules(LAB_RULES);
}(window.TalesmithTsl));
