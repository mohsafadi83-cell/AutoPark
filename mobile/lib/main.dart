import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers/app_providers.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/splash_screen.dart';
import 'features/shell/main_shell_screen.dart';
import 'l10n/generated/app_localizations.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: AutoParkApp(),
    ),
  );
}

class AutoParkApp extends ConsumerWidget {
  const AutoParkApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appState = ref.watch(appControllerProvider);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Auto Park',
      locale: appState.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      themeMode: appState.themeMode,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: appState.isBootstrapping
          ? const SplashScreen()
          : (appState.isAuthenticated
              ? const MainShellScreen()
              : const LoginScreen()),
    );
  }
}
