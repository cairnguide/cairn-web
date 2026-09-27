/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // Class names use the wireframe vocabulary (setup-steps, button-primary).
    'selector-class-pattern': '^[a-z][a-z0-9-]*$',
    'no-descending-specificity': null,
  },
};
