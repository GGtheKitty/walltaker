import {Controller} from "@hotwired/stimulus"
import {WithModal} from 'modules/modal'

export default class TabsController extends Controller {
    static targets = ['tab', 'label']
    currentTab = 0

    connect () {
        // Turbo snapshots retain generated markup, but not its event listeners.
        this.element.querySelector(':scope > .tabs__labels')?.remove();
        const restoredTab = this.tabTargets.findIndex(tab => tab.dataset.open === 'true');
        if (restoredTab >= 0) this.currentTab = restoredTab;

        const tabLabels = document.createElement('div');
        tabLabels.className = 'tabs__labels';

        this.tabTargets.forEach((tab, index) => {
            const tabLabel = document.createElement('button');
            tabLabel.type = 'button';
            tabLabel.innerText = tab.dataset.title;
            tabLabel.dataset.tabsTarget = 'label';
            tabLabel.addEventListener('click', () => this.open(index))
            tabLabels.appendChild(tabLabel);
        })

        this.scope.element.appendChild(tabLabels);

        this.tick();
    }

    open (tabIndex) {
        this.currentTab = tabIndex;
        this.tick();
    }

    tick () {
        this.tabTargets[this.currentTab].dataset.open = true;
        this.tabTargets.filter((_, index) => index !== this.currentTab).forEach(tab => tab.dataset.open = false);

        this.labelTargets[this.currentTab].dataset.open = true;
        this.labelTargets.filter((_, index) => index !== this.currentTab).forEach(tab => tab.dataset.open = false);
    }
}
