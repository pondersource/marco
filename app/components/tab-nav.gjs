import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import eq from 'ember-truth-helpers/helpers/eq';

<template>
  <nav class="tab-nav">
    {{#each @tabs as |tab|}}
      <button
        type="button"
        class="tab-nav-button {{if (eq @active tab.value) 'is-active'}}"
        {{on "click" (fn @onChange tab.value)}}
      >
        {{tab.label}}
      </button>
    {{/each}}
  </nav>
</template>
