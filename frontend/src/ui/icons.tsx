import type { FunctionComponent } from 'preact';
import {
  Activity, AlarmClock, AlertTriangle, BarChart3, Bell, Book, BookOpen, Bookmark, Bot, Box, Braces,
  Calendar, CalendarDays, Check, ChevronDown, ChevronRight, Clapperboard, Clock, Cloud, CloudOff,
  CloudSun, Command, Container, Copy, Cpu, Download, DownloadCloud, ExternalLink, Gauge, Globe,
  GripVertical, Hash, Home, Image, Keyboard, Layers, LayoutGrid, LineChart, Link, List, ListOrdered,
  LogIn, LogOut, Map, Maximize2, MessageSquare, Monitor, Moon, Music, Pencil, Play, PlayCircle, Plus,
  Radar, RefreshCw, Rss, Search, Server, Settings, Shield, ShieldCheck, Sparkles, StickyNote, Subtitles,
  Sun, Table, Timer, Trash2, Tv, Type, Undo2, Wind, X, Zap,
  Star, Plug, Users, User, Key, Mail, Database, Archive, Upload, Smartphone, Eye, EyeOff, Lock, Unlock,
  FileText, ScrollText, HardDrive, Palette, Wrench, Puzzle, Package, FolderUp, Network, Droplet, ArrowUp,
  ArrowDown, Filter, Save, Power, LayoutDashboard, Info, CircleCheck, CircleX, CircleAlert, QrCode,
  SlidersHorizontal, ChevronLeft, ChevronsLeft, ChevronsRight, RotateCcw, Wallpaper,
} from 'lucide-preact';

type IconCmp = FunctionComponent<{ size?: number | string; strokeWidth?: number; class?: string }>;

const MAP: Record<string, IconCmp> = {
  activity: Activity, 'alarm-clock': AlarmClock, 'alert-triangle': AlertTriangle, 'bar-chart': BarChart3,
  'bar-chart-2': BarChart3, 'bar-chart-3': BarChart3, bell: Bell, book: Book, 'book-open': BookOpen,
  bookmark: Bookmark, bot: Bot, box: Box, braces: Braces, calendar: Calendar, 'calendar-days': CalendarDays,
  check: Check, 'chevron-down': ChevronDown, 'chevron-right': ChevronRight, clapperboard: Clapperboard,
  clock: Clock, cloud: Cloud, 'cloud-off': CloudOff, 'cloud-sun': CloudSun, command: Command,
  container: Container, copy: Copy, cpu: Cpu, download: Download, 'download-cloud': DownloadCloud,
  'external-link': ExternalLink, gauge: Gauge, globe: Globe, grip: GripVertical, hash: Hash, home: Home,
  image: Image, keyboard: Keyboard, layers: Layers, grid: LayoutGrid, 'line-chart': LineChart, link: Link,
  list: List, 'list-ordered': ListOrdered, login: LogIn, logout: LogOut, map: Map, maximize: Maximize2,
  'message-square': MessageSquare, monitor: Monitor, moon: Moon, music: Music, pencil: Pencil, play: Play,
  'play-circle': PlayCircle, plus: Plus, radar: Radar, refresh: RefreshCw, rss: Rss, search: Search,
  server: Server, settings: Settings, shield: Shield, 'shield-check': ShieldCheck, sparkles: Sparkles,
  'sticky-note': StickyNote, subtitles: Subtitles, sun: Sun, table: Table, timer: Timer, trash: Trash2,
  tv: Tv, type: Type, undo: Undo2, wind: Wind, x: X, zap: Zap,
  star: Star, plug: Plug, users: Users, user: User, key: Key, mail: Mail, database: Database, archive: Archive,
  upload: Upload, smartphone: Smartphone, eye: Eye, 'eye-off': EyeOff, lock: Lock, unlock: Unlock,
  'file-text': FileText, 'scroll-text': ScrollText, 'hard-drive': HardDrive, palette: Palette, wrench: Wrench,
  puzzle: Puzzle, package: Package, 'folder-up': FolderUp, network: Network, droplet: Droplet, 'arrow-up': ArrowUp,
  'arrow-down': ArrowDown, filter: Filter, save: Save, power: Power, dashboard: LayoutDashboard, info: Info,
  ok: CircleCheck, fail: CircleX, warn: CircleAlert, qr: QrCode, sliders: SlidersHorizontal,
  'chevron-left': ChevronLeft, 'chevrons-left': ChevronsLeft, 'chevrons-right': ChevronsRight,
  reset: RotateCcw, wallpaper: Wallpaper, 'layout-dashboard': LayoutDashboard, 'shield-alert': Shield,
  'calendar-clock': CalendarDays, 'cloud-download': DownloadCloud, 'chart-line': LineChart, 'chart-bar': BarChart3,
};

export function Icon({ name, size = 16, class: cls }: { name: string; size?: number; class?: string }) {
  const Cmp = MAP[name] || Box;
  return <Cmp size={size} strokeWidth={1.75} class={cls} />;
}
