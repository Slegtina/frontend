import {
  mdiAutorenew,
  mdiCalendarSync,
  mdiDotsVertical,
  mdiFan,
  mdiFire,
  mdiPower,
  mdiSnowflake,
  mdiWaterPercent,
} from "@mdi/js";
import "@thomasloven/round-slider";
import { HassEntity } from "home-assistant-js-websocket";
import {
  css,
  CSSResultGroup,
  html,
  LitElement,
  PropertyValues,
  svg,
  TemplateResult,
} from "lit";
import { customElement, property, state, query } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { UNIT_F } from "../../../common/const";
import { applyThemesOnElement } from "../../../common/dom/apply_themes_on_element";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/ha-card";
import type { HaCard } from "../../../components/ha-card";
import "../../../components/ha-icon-button";
import {
  ClimateEntity,
  CLIMATE_PRESET_NONE,
  compareClimateHvacModes,
  HvacMode,
} from "../../../data/climate";
import { UNAVAILABLE } from "../../../data/entity";
import { HomeAssistant } from "../../../types";
import { findEntities } from "../common/find-entities";
import { hasConfigOrEntityChanged } from "../common/has-changed";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import { LovelaceCard, LovelaceCardEditor } from "../types";
import { ThermostatCardConfig } from "./types";

const modeIcons: { [mode in HvacMode]: string } = {
  auto: mdiCalendarSync,
  heat_cool: mdiAutorenew,
  heat: mdiFire,
  cool: mdiSnowflake,
  off: mdiPower,
  fan_only: mdiFan,
  dry: mdiWaterPercent,
};

@customElement("hui-thermostat-card")
export class HuiThermostatCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-thermostat-card-editor");
    return document.createElement("hui-thermostat-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): ThermostatCardConfig {
    const includeDomains = ["climate"];
    const maxEntities = 1;
    const foundEntities = findEntities(
      hass,
      maxEntities,
      entities,
      entitiesFallback,
      includeDomains
    );

    return { type: "thermostat", entity: foundEntities[0] || "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: ThermostatCardConfig;

  @state() private _setTemp?: number | number[];

  @query("ha-card") private _card?: HaCard;

  public getCardSize(): number {
    return 7;
  }

  public setConfig(config: ThermostatCardConfig): void {
    if (!config.entity || config.entity.split(".")[0] !== "climate") {
      throw new Error("Specify an entity from within the climate domain");
    }

    this._config = config;
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }
    const stateObj = this.hass.states[this._config.entity] as ClimateEntity;

    if (!stateObj) {
      return html`
        <hui-warning>
          ${createEntityNotFoundWarning(this.hass, this._config.entity)}
        </hui-warning>
      `;
    }

    const mode = stateObj.state in modeIcons ? stateObj.state : "unknown-mode";
    const name =
      this._config!.name ||
      computeStateName(this.hass!.states[this._config!.entity]);
    const targetTemp =
      stateObj.attributes.temperature !== null &&
      Number.isFinite(Number(stateObj.attributes.temperature))
        ? stateObj.attributes.temperature
        : stateObj.attributes.min_temp;

    const slider =
      stateObj.state === UNAVAILABLE
        ? html` <input type="range" disabled="true" /> `
        : html`
            <input
              type="range"
              .value=${targetTemp}
              .min=${stateObj.attributes.min_temp}
              .max=${stateObj.attributes.max_temp}
              .step=${this._stepSize}
              @input=${this._dragEvent}
              @change=${this._setTemperature}
            />
          `;

    const currentTemperature = svg`
        <svg viewBox="0 0 40 20">
          <text
            x="50%"
            dx="1"
            y="60%"
            text-anchor="middle"
            style="font-size: 13px;"
          >
            ${
              stateObj.attributes.current_temperature !== null &&
              !isNaN(stateObj.attributes.current_temperature)
                ? svg`${formatNumber(
                    stateObj.attributes.current_temperature,
                    this.hass.locale
                  )}
            <tspan dx="-3" dy="-6.5" style="font-size: 4px;">
              ${this.hass.config.unit_system.temperature}
            </tspan>`
                : ""
            }
          </text>
        </svg>
      `;

    const setValues = svg`
      <svg id="set-values">
        <g>
          <text text-anchor="middle" class="set-value">
            ${
              stateObj.state === UNAVAILABLE
                ? this.hass.localize("state.default.unavailable")
                : this._setTemp === undefined || this._setTemp === null
                ? ""
                : Array.isArray(this._setTemp)
                ? this._stepSize === 1
                  ? svg`
                      ${formatNumber(this._setTemp[0], this.hass.locale, {
                        maximumFractionDigits: 0,
                      })} -
                      ${formatNumber(this._setTemp[1], this.hass.locale, {
                        maximumFractionDigits: 0,
                      })}
                      `
                  : svg`
                      ${formatNumber(this._setTemp[0], this.hass.locale, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })} -
                      ${formatNumber(this._setTemp[1], this.hass.locale, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      `
                : this._stepSize === 1
                ? svg`
                      ${formatNumber(this._setTemp, this.hass.locale, {
                        maximumFractionDigits: 0,
                      })}
                      `
                : svg`
                      ${formatNumber(this._setTemp, this.hass.locale, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      `
            }
          </text>
          <text
            dy="22"
            text-anchor="middle"
            id="set-mode"
          >
            ${
              stateObj.attributes.hvac_action
                ? this.hass!.localize(
                    `state_attributes.climate.hvac_action.${stateObj.attributes.hvac_action}`
                  )
                : this.hass!.localize(
                    `component.climate.state._.${stateObj.state}`
                  )
            }
            ${
              stateObj.attributes.preset_mode &&
              stateObj.attributes.preset_mode !== CLIMATE_PRESET_NONE
                ? html`
                    -
                    ${this.hass!.localize(
                      `state_attributes.climate.preset_mode.${stateObj.attributes.preset_mode}`
                    ) || stateObj.attributes.preset_mode}
                  `
                : ""
            }
          </text>
        </g>
      </svg>
    `;

    return html`
      <ha-card
        class=${classMap({
          [mode]: true,
        })}
      >
        <ha-icon-button
          class="more-info"
          .label=${this.hass!.localize(
            "ui.panel.lovelace.cards.show_more_info"
          )}
          .path=${mdiDotsVertical}
          @click=${this._handleMoreInfo}
          tabindex="0"
        ></ha-icon-button>

        <div class="content">
          <div id="controls">
            <div id="slider">
              <div id="slider-center">
                <div id="temperature">${currentTemperature} ${setValues}</div>
              </div>
              ${slider}
            </div>
          </div>
          <div id="info" .title=${name}>
            <div id="modes">
              ${(stateObj.attributes.hvac_modes || [])
                .concat()
                .sort(compareClimateHvacModes)
                .map((modeItem) => this._renderIcon(modeItem, mode))}
            </div>
            ${name}
          </div>
        </div>
      </ha-card>
    `;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    return hasConfigOrEntityChanged(this, changedProps);
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (
      !this._config ||
      !this.hass ||
      (!changedProps.has("hass") && !changedProps.has("_config"))
    ) {
      return;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    const oldConfig = changedProps.get("_config") as
      | ThermostatCardConfig
      | undefined;

    if (
      !oldHass ||
      !oldConfig ||
      oldHass.themes !== this.hass.themes ||
      oldConfig.theme !== this._config.theme
    ) {
      applyThemesOnElement(this, this.hass.themes, this._config.theme);
    }

    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return;
    }

    if (!oldHass || oldHass.states[this._config.entity] !== stateObj) {
      this._rescale_svg();
    }
  }

  public willUpdate(changedProps: PropertyValues) {
    if (!this.hass || !this._config || !changedProps.has("hass")) {
      return;
    }

    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;

    if (!oldHass || oldHass.states[this._config.entity] !== stateObj) {
      this._setTemp = this._getSetTemp(stateObj);
    }
  }

  private _rescale_svg() {
    // Set the viewbox of the SVG containing the set temperature to perfectly
    // fit the text
    // That way it will auto-scale correctly
    // This is not done to the SVG containing the current temperature, because
    // it should not be centered on the text, but only on the value
    const card = this._card;
    if (card) {
      card.updateComplete.then(() => {
        const svgRoot = this.shadowRoot!.querySelector("#set-values")!;
        const box = svgRoot.querySelector("g")!.getBBox()!;
        svgRoot.setAttribute(
          "viewBox",
          `${box.x} ${box!.y} ${box.width} ${box.height}`
        );
        svgRoot.setAttribute("width", `${box.width}`);
        svgRoot.setAttribute("height", `${box.height}`);
      });
    }
  }

  private get _stepSize(): number {
    const stateObj = this.hass!.states[this._config!.entity] as ClimateEntity;

    if (stateObj.attributes.target_temp_step) {
      return stateObj.attributes.target_temp_step;
    }
    return this.hass!.config.unit_system.temperature === UNIT_F ? 1 : 0.5;
  }

  private _getSetTemp(
    stateObj: HassEntity
  ): undefined | number | [number, number] {
    if (stateObj.state === UNAVAILABLE) {
      return undefined;
    }

    if (
      stateObj.attributes.target_temp_low &&
      stateObj.attributes.target_temp_high
    ) {
      return [
        stateObj.attributes.target_temp_low,
        stateObj.attributes.target_temp_high,
      ];
    }

    return stateObj.attributes.temperature;
  }

  private _dragEvent(e): void {
    this._setTemp = e.target.valueAsNumber;
  }

  private _setTemperature(e): void {
    this.hass!.callService("climate", "set_temperature", {
      entity_id: this._config!.entity,
      temperature: e.target.valueAsNumber,
    });
  }

  private _renderIcon(mode: string, currentMode: string): TemplateResult {
    if (!modeIcons[mode]) {
      return html``;
    }
    return html`
      <ha-icon-button
        class=${classMap({ "selected-icon": currentMode === mode })}
        .mode=${mode}
        @click=${this._handleAction}
        tabindex="0"
        .path=${modeIcons[mode]}
        .label=${this.hass!.localize(`component.climate.state._.${mode}`)}
      >
      </ha-icon-button>
    `;
  }

  private _handleMoreInfo() {
    fireEvent(this, "hass-more-info", {
      entityId: this._config!.entity,
    });
  }

  private _handleAction(e: MouseEvent): void {
    this.hass!.callService("climate", "set_hvac_mode", {
      entity_id: this._config!.entity,
      hvac_mode: (e.currentTarget as any).mode,
    });
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
      }

      ha-card {
        height: 100%;
        position: relative;
        overflow: hidden;
        --name-font-size: 1.2rem;
        --brightness-font-size: 1.2rem;
        --rail-border-color: transparent;
      }
      .auto,
      .heat_cool {
        --mode-color: var(--state-climate-auto-color);
      }
      .cool {
        --mode-color: var(--state-climate-cool-color);
      }
      .heat {
        --mode-color: var(--state-climate-heat-color);
      }
      .manual {
        --mode-color: var(--state-climate-manual-color);
      }
      .off {
        --mode-color: var(--state-climate-off-color);
      }
      .fan_only {
        --mode-color: var(--state-climate-fan_only-color);
      }
      .eco {
        --mode-color: var(--state-climate-eco-color);
      }
      .dry {
        --mode-color: var(--state-climate-dry-color);
      }
      .idle {
        --mode-color: var(--state-climate-idle-color);
      }
      .unknown-mode {
        --mode-color: var(--state-unknown-color);
      }

      .more-info {
        position: absolute;
        cursor: pointer;
        top: 0;
        right: 0;
        border-radius: 100%;
        color: var(--secondary-text-color);
        z-index: 1;
      }

      .content {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      #controls {
        display: flex;
        justify-content: center;
        padding: 16px;
        position: relative;
      }

      #slider {
        height: 100%;
        width: 100%;
        position: relative;
        max-width: 250px;
        min-width: 100px;
      }

      input[type="range"] {
        width: 100%;
        padding-bottom: 30%;
        padding-top: 30%;
      }

      #slider-center {
        position: absolute;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        border-radius: 100%;
        left: 0px;
        top: 0px;
        text-align: center;
        overflow-wrap: break-word;
        pointer-events: none;
      }

      #temperature {
        position: absolute;
        width: 100%;
        height: 50%;
        top: 0%;
        left: 0%;
      }

      #set-values {
        max-width: 80%;
        transform: translate(0, -50%);
        font-size: 20px;
      }

      #set-mode {
        fill: var(--secondary-text-color);
        font-size: 16px;
      }

      #info {
        display: flex-vertical;
        justify-content: center;
        text-align: center;
        padding: 16px;
        margin-top: -60px;
        font-size: var(--name-font-size);
      }

      #modes > * {
        color: var(--disabled-text-color);
        cursor: pointer;
        display: inline-block;
      }

      #modes .selected-icon {
        color: var(--mode-color);
      }

      text {
        fill: var(--primary-text-color);
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-thermostat-card": HuiThermostatCard;
  }
}
