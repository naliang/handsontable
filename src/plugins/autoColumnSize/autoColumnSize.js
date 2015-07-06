
import BasePlugin from './../_base.js';
import {arrayEach, objectEach, rangeEach, requestAnimationFrame, cancelAnimationFrame} from './../../helpers.js';
import {GhostTable} from './../../utils/ghostTable.js';
import {SamplesGenerator} from './../../utils/samplesGenerator.js';
import {registerPlugin} from './../../plugins.js';


/**
 * @class AutoColumnSize
 * @plugin AutoColumnSize
 */
class AutoColumnSize extends BasePlugin {
  static get CALCULATION_STEP() {
    return 19;
  }

  /**
   * @param {Core} hotInstance Handsontable instance.
   */
  constructor(hotInstance) {
    super(hotInstance);
    /**
     * Cached columns widths.
     *
     * @type {Array}
     */
    this.widths = [];
    /**
     * Instance of GhostTable for rows and columns size calculations.
     *
     * @type {GhostTable}
     */
    this.ghostTable = new GhostTable(this.hot);
    /**
     * Instance of SamplesGenerator for generating samples necessary for columns width calculations.
     *
     * @type {SamplesGenerator}
     */
    this.samplesGenerator = new SamplesGenerator((row, col) => this.hot.getDataAtCell(row, col));
  }

  /**
   * Check if the plugin is enabled in the handsontable settings.
   *
   * @returns {Boolean}
   */
  isEnabled() {
    return this.hot.getSettings().autoColumnSize !== false && !this.hot.getSettings().colWidths;
  }

  /**
   * Enable plugin for this Handsontable instance.
   */
  enablePlugin() {
    if (this.enabled) {
      return;
    }
    this.addHook('beforeRender', (force) => this.onBeforeRender(force));
    this.addHook('modifyColWidth', (width, col) => this.getColumnWidth(col, width));
    this.addHook('beforeChange', (changes) => this.onBeforeChange(changes));
    this.addHook('afterLoadData', () => this.onAfterLoadData());
    this.addHook('beforeColumnResize', (col, size, isDblClick) => this.onBeforeColumnResize(col, size, isDblClick));
    super.enablePlugin();
  }

  /**
   * Calculate columns width.
   *
   * @param {Number|Object} colRange Column range object.
   * @param {Number|Object} rowRange Row range object.
   * @param {Boolean} [force=false] If `true` force calculate width even when value was cached earlier.
   */
  calculateColumnsWidth(colRange = {from: 0, to: this.hot.countCols() - 1}, rowRange = {from: 0, to: this.hot.countRows() - 1}, force = false) {
    if (typeof colRange === 'number') {
      colRange = {from: colRange, to: colRange};
    }
    if (typeof rowRange === 'number') {
      rowRange = {from: rowRange, to: rowRange};
    }
    rangeEach(colRange.from, colRange.to, (col) => {
      if (force || (this.widths[col] === void 0 && !this.hot._getColWidthFromSettings(col))) {
        const samples = this.samplesGenerator.generateColumnSamples(col, rowRange);

        samples.forEach((sample, col) => {
          this.ghostTable.addColumn(col, sample);
        });
      }
    });

    if (this.ghostTable.columns.length) {
      this.ghostTable.getWidths((col, width) => {
        this.widths[col] = width;
      });
      this.ghostTable.clean();
    }
  }

  /**
   * Calculate all columns width.
   *
   * @param {Object|Number} rowRange Row range object.
   */
  calculateAllColumnsWidth(rowRange = {from: 0, to: this.hot.countRows() - 1}) {
    let current = 0;
    let length = this.hot.countRows() - 1;
    let timer = null;

    let loop = () => {
      // When hot was destroyed after calculating finished cancel frame
      if (!this.hot) {
        cancelAnimationFrame(timer);

        return;
      }
      this.calculateColumnsWidth({from: current, to: Math.min(current + AutoColumnSize.CALCULATION_STEP, length)}, rowRange, true);
      current = current + AutoColumnSize.CALCULATION_STEP + 1;

      if (current < length) {
        timer = requestAnimationFrame(loop);
      } else {
        if (timer !== null) {
          cancelAnimationFrame(timer);
        }
        // @TODO Should call once per render cycle, currently fired separately in different plugins
        this.hot.view.wt.wtOverlays.adjustElementsSize(true);
        // tmp
        if (this.hot.view.wt.wtOverlays.leftOverlay.needFullRender) {
          this.hot.view.wt.wtOverlays.leftOverlay.clone.draw();
        }
      }
    };
    if (current < length) {
      loop();
    }
  }

  /**
   * Get calculated column height.
   *
   * @param {Number} col Column index.
   * @param {Number} [defaultWidth] Default column width. It will be pick up if no calculated width found.
   * @returns {Number}
   */
  getColumnWidth(col, defaultWidth = void 0) {
    let width = defaultWidth;

    if (this.widths[col] !== void 0 && this.widths[col] > (defaultWidth || 0)) {
      width = this.widths[col];
    }

    return width;
  }

  /**
   * Get first visible column.
   *
   * @returns {Number} Returns column index or -1 if table is not rendered.
   */
  getFirstVisibleColumn() {
    const wot = this.hot.view.wt;

    if (wot.wtViewport.columnsVisibleCalculator) {
      return wot.wtTable.getFirstVisibleColumn();
    }
    if (wot.wtViewport.columnsRenderCalculator) {
      return wot.wtTable.getFirstRenderedColumn();
    }

    return -1;
  }

  /**
   * Get last visible column.
   *
   * @returns {Number} Returns column index or -1 if table is not rendered.
   */
  getLastVisibleColumn() {
    const wot = this.hot.view.wt;

    if (wot.wtViewport.columnsVisibleCalculator) {
      return wot.wtTable.getLastVisibleColumn();
    }
    if (wot.wtViewport.columnsRenderCalculator) {
      return wot.wtTable.getLastRenderedColumn();
    }

    return -1;
  }

  /**
   * Clear cached widths.
   */
  clearCache() {
    this.widths.length = 0;
  }

  /**
   * On before render listener.
   *
   * @private
   */
  onBeforeRender() {
    let force = this.hot.renderCall;
    this.calculateColumnsWidth({from: this.getFirstVisibleColumn(), to: this.getLastVisibleColumn()}, void 0, force);
  }

  /**
   * On after load data listener.
   *
   * @private
   */
  onAfterLoadData() {
    setTimeout(() => {
      if (this.hot) {
        this.calculateAllColumnsWidth();
      }
    }, 0);
  }

  /**
   * On before change listener.
   *
   * @private
   * @param {Array} changes
   */
  onBeforeChange(changes) {
    arrayEach(changes, (data) => {
      this.widths[data[1]] = void 0;
    });
  }

  /**
   * On before column resize listener.
   *
   * @param {Number} col
   * @param {Number} size
   * @param {Boolean} isDblClick
   * @returns {Number}
   */
  onBeforeColumnResize(col, size, isDblClick) {
    if (isDblClick) {
      this.calculateColumnsWidth(void 0, col, true);
      size = this.getColumnWidth(col);
    }

    return size;
  }

  /**
   * Destroy plugin instance.
   */
  destroy() {
    this.ghostTable.clean();
    super.destroy();
  }
}

export {AutoColumnSize};

registerPlugin('autoColumnSize', AutoColumnSize);
