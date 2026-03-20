import arrowLeft from 'feather-icons/dist/icons/arrow-left.svg?raw';
import activity from 'feather-icons/dist/icons/activity.svg?raw';
import bookmark from 'feather-icons/dist/icons/bookmark.svg?raw';
import checkSquare from 'feather-icons/dist/icons/check-square.svg?raw';
import clock from 'feather-icons/dist/icons/clock.svg?raw';
import edit from 'feather-icons/dist/icons/edit.svg?raw';
import facebook from 'feather-icons/dist/icons/facebook.svg?raw';
import gift from 'feather-icons/dist/icons/gift.svg?raw';
import globe from 'feather-icons/dist/icons/globe.svg?raw';
import heart from 'feather-icons/dist/icons/heart.svg?raw';
import home from 'feather-icons/dist/icons/home.svg?raw';
import info from 'feather-icons/dist/icons/info.svg?raw';
import instagram from 'feather-icons/dist/icons/instagram.svg?raw';
import logIn from 'feather-icons/dist/icons/log-in.svg?raw';
import logOut from 'feather-icons/dist/icons/log-out.svg?raw';
import mail from 'feather-icons/dist/icons/mail.svg?raw';
import map from 'feather-icons/dist/icons/map.svg?raw';
import mapPin from 'feather-icons/dist/icons/map-pin.svg?raw';
import menu from 'feather-icons/dist/icons/menu.svg?raw';
import navigation from 'feather-icons/dist/icons/navigation.svg?raw';
import phone from 'feather-icons/dist/icons/phone.svg?raw';
import plus from 'feather-icons/dist/icons/plus.svg?raw';
import server from 'feather-icons/dist/icons/server.svg?raw';
import search from 'feather-icons/dist/icons/search.svg?raw';
import settings from 'feather-icons/dist/icons/settings.svg?raw';
import target from 'feather-icons/dist/icons/target.svg?raw';
import user from 'feather-icons/dist/icons/user.svg?raw';
import x from 'feather-icons/dist/icons/x.svg?raw';
import zap from 'feather-icons/dist/icons/zap.svg?raw';
import camera from '@waysidemapping/pinhead/dist/icons/camera.svg?raw';
import cupAndSaucer from '@waysidemapping/pinhead/dist/icons/cup_and_saucer.svg?raw';
import forkAndKnife from '@waysidemapping/pinhead/dist/icons/fork_and_knife.svg?raw';
import personSleepingInBed from '@waysidemapping/pinhead/dist/icons/person_sleeping_in_bed.svg?raw';
import shoppingBasket from '@waysidemapping/pinhead/dist/icons/shopping_basket.svg?raw';
import wikipedia from '../icons/wikipedia.svg?raw';

const ICONS = {
  'arrow-left': arrowLeft,
  activity,
  bookmark,
  camera,
  'check-square': checkSquare,
  clock,
  'cup-and-saucer': cupAndSaucer,
  edit,
  facebook,
  gift,
  globe,
  heart,
  home,
  info,
  instagram,
  'fork-and-knife': forkAndKnife,
  'log-in': logIn,
  'log-out': logOut,
  mail,
  map,
  'map-pin': mapPin,
  menu,
  navigation,
  'person-sleeping-in-bed': personSleepingInBed,
  phone,
  plus,
  server,
  search,
  settings,
  'shopping-basket': shoppingBasket,
  target,
  user,
  wikipedia,
  x,
  zap,
};

const FILLED_ICONS = [
  'fork-and-knife',
  'wikipedia',
  'cup-and-saucer',
  'shopping-basket',
  'camera',
  'person-sleeping-in-bed',
];

export function getIcon(name) {
  return ICONS[name];
}

export function isIconFilled(name) {
  return FILLED_ICONS.includes(name);
}
