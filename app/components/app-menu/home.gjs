import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from '#components/icon';

<template>
  <div class="sidebar-header">
    <h2>
      <img src="/icons/icon-rounded.svg" alt="" width="32" height="32" />
      Marco
    </h2>
    <button type="button" class="close-btn" {{on "click" @onClose}}>
      <Icon @name="x" @size={{20}} @color="#333" />
    </button>
  </div>

  <div class="sidebar-content">
    <ul class="app-menu">
      <li>
        <button type="button" {{on "click" (fn @onNavigate "settings")}}>
          <Icon @name="settings" @size={{20}} />
          <span>Settings</span>
        </button>
      </li>
      <li>
        <button type="button" {{on "click" (fn @onNavigate "about")}}>
          <Icon @name="info" @size={{20}} />
          <span>About</span>
        </button>
      </li>
    </ul>
  </div>
</template>
