import {Controller} from '@hotwired/stimulus';
import Chartkick from 'chartkick';
import 'chartkick/chart.js';

export default class extends Controller {
  static values = {data:Array};
  connect() {
    this.chart = new Chartkick.AreaChart(this.element,this.dataValue,{colors:['#606575'],legend:false,height:'60px',library:{scales:{x:{display:false},y:{display:false}}}});
  }
  disconnect() { this.chart?.destroy(); }
}
