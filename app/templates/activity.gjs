import ActivityTimeline from '#components/activity-timeline';

<template>
  {{#if @controller.mapUi.isSidebarVisible}}
    <ActivityTimeline
      @items={{@controller.items}}
      @isLoading={{@controller.isLoading}}
      @isConnected={{@controller.isConnected}}
      @sourceMode={{@controller.sourceMode}}
      @onSetSourceMode={{@controller.setSourceMode}}
      @isLoadingMore={{@controller.isLoadingMore}}
      @onLoadMore={{@controller.loadMore}}
      @scrollTop={{@controller.scrollTop}}
      @onSelect={{@controller.selectItem}}
      @onBack={{@controller.backToMenu}}
      @onClose={{@controller.close}}
      @onNostrConnected={{@controller.onNostrConnected}}
    />
  {{/if}}
</template>
