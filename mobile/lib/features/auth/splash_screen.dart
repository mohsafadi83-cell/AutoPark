import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../l10n/generated/app_localizations.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.bgDark,
              Color(0xFF0E1E38),
              AppColors.bgDark,
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: AppColors.primaryCyan.withOpacity(0.14),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.primaryCyan.withOpacity(0.5),
                    width: 2,
                  ),
                ),
                child: const Icon(
                  Icons.precision_manufacturing_rounded,
                  size: 64,
                  color: AppColors.primaryCyan,
                ),
              ),
              const SizedBox(height: 22),
              Text(
                l10n.appTitle,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                l10n.appSubtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 36),
              const SizedBox(
                width: 32,
                height: 32,
                child: CircularProgressIndicator(
                  strokeWidth: 3,
                  color: AppColors.primaryCyan,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                l10n.restoringSession,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.apartment_rounded,
                      size: 18,
                      color: AppColors.primaryCyan,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      l10n.companyName,
                      style: const TextStyle(
                        color: Color(0xFFCBD5E1),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
