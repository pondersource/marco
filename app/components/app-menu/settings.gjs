import { on } from '@ember/modifier';
import Icon from '#components/icon';
import AppMenuSettingsMapUi from './settings/map-ui';
import AppMenuSettingsApis from './settings/apis';
import AppMenuSettingsNostr from './settings/nostr';

<template>
  <div class="sidebar-header">
    <button type="button" class="back-btn" {{on "click" @onBack}}>
      <Icon @name="arrow-left" @size={{20}} @color="#333" />
    </button>
    <h2>Settings</h2>
    <button type="button" class="close-btn" {{on "click" @onClose}}>
      <Icon @name="x" @size={{20}} @color="#333" />
    </button>
  </div>

  <div class="sidebar-content">
    <section class="settings-section">
      <AppMenuSettingsMapUi />
      <AppMenuSettingsApis />
      <AppMenuSettingsNostr />
    </section>
  </div>
</template>
