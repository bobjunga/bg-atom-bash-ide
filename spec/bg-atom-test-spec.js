'use babel';

import BgAtomTest from '../lib/bg-atom-test';

// Use the command `window:run-package-specs` (cmd-alt-ctrl-p) to run specs.
//
// To run a specific `it` or `describe` block add an `f` to the front (e.g. `fit`
// or `fdescribe`). Remove the `f` to unfocus the block.

describe('BgAtomTest', () => {
  let workspaceElement, activationPromise;

  beforeEach(() => {
    workspaceElement = atom.views.getView(atom.workspace);
    activationPromise = atom.packages.activatePackage('bg-atom-test');
  });

  describe('when the bg-atom-test:toggle event is triggered', () => {
    it('hides and shows the modal panel', () => {
      // Before the activation event the view is not on the DOM, and no panel
      // has been created
      expect(workspaceElement.querySelector('.bg-atom-test')).not.toExist();

      // This is an activation event, triggering it will cause the package to be
      // activated.
      atom.commands.dispatch(workspaceElement, 'bg-atom-test:toggle');

      waitsForPromise(() => {
        return activationPromise;
      });

      runs(() => {
        expect(workspaceElement.querySelector('.bg-atom-test')).toExist();

        let bgAtomTestElement = workspaceElement.querySelector('.bg-atom-test');
        expect(bgAtomTestElement).toExist();

        let bgAtomTestPanel = atom.workspace.panelForItem(bgAtomTestElement);
        expect(bgAtomTestPanel.isVisible()).toBe(true);
        atom.commands.dispatch(workspaceElement, 'bg-atom-test:toggle');
        expect(bgAtomTestPanel.isVisible()).toBe(false);
      });
    });

    it('hides and shows the view', () => {
      // This test shows you an integration test testing at the view level.

      // Attaching the workspaceElement to the DOM is required to allow the
      // `toBeVisible()` matchers to work. Anything testing visibility or focus
      // requires that the workspaceElement is on the DOM. Tests that attach the
      // workspaceElement to the DOM are generally slower than those off DOM.
      jasmine.attachToDOM(workspaceElement);

      expect(workspaceElement.querySelector('.bg-atom-test')).not.toExist();

      // This is an activation event, triggering it causes the package to be
      // activated.
      atom.commands.dispatch(workspaceElement, 'bg-atom-test:toggle');

      waitsForPromise(() => {
        return activationPromise;
      });

      runs(() => {
        // Now we can test for view visibility
        let bgAtomTestElement = workspaceElement.querySelector('.bg-atom-test');
        expect(bgAtomTestElement).toBeVisible();
        atom.commands.dispatch(workspaceElement, 'bg-atom-test:toggle');
        expect(bgAtomTestElement).not.toBeVisible();
      });
    });
  });
});
