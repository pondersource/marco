import ActivityTimeline from '#components/activity-timeline';

<template>
  {{#if @controller.mapUi.isSidebarVisible}}
    <ActivityTimeline
      @items={{@controller.items}}
      @isLoading={{@controller.loadTask.isRunning}}
      @isConnected={{@controller.isConnected}}
      @sourceMode={{@controller.sourceMode}}
      @onSetSourceMode={{@controller.setSourceMode}}
      @scrollTop={{@controller.scrollTop}}
      @onSelect={{@controller.selectItem}}
      @onBack={{@controller.backToMenu}}
      @onClose={{@controller.close}}
      @onNostrConnected={{@controller.onNostrConnected}}
    />
  {{/if}}
</template>
