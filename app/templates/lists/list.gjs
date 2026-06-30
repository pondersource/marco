import PlacesSidebar from '#components/places-sidebar';

<template>
  {{#if @controller.mapUi.isSidebarVisible}}
    <PlacesSidebar
      @places={{@controller.places}}
      @title={{@controller.listTitle}}
      @color={{@controller.listColor}}
      @scrollTop={{@controller.scrollTop}}
      @isLoading={{@controller.loadPlacesTask.isRunning}}
      @onSelect={{@controller.selectPlace}}
      @onClose={{@controller.close}}
      @onBack={{@controller.backToLists}}
    />
  {{/if}}
</template>
