import { pageTitle } from 'ember-page-title';
import Map from '#components/map';

<template>
  {{pageTitle "M/\RCO"}}

  <Map />

  {{outlet}}
</template>
